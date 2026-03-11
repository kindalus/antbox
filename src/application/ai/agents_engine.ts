import {
	createEvent,
	FunctionTool,
	InMemoryRunner,
	isFinalResponse,
	LlmAgent,
	LoopAgent,
	ParallelAgent,
	SequentialAgent,
} from "@google/adk";
import { z } from "zod";
import { type Either, left, right } from "shared/either.ts";
import {
	AntboxError,
	AntboxError as AntboxErrorClass,
	ForbiddenError,
} from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { ChatHistory, ChatMessage } from "domain/ai/chat_message.ts";
import type { AgentsService } from "./agents_service.ts";
import type { NodeService } from "../nodes/node_service.ts";
import type { AspectsService } from "../aspects/aspects_service.ts";
import { NodeServiceProxy } from "../nodes/node_service_proxy.ts";
import { AspectServiceProxy } from "../aspects/aspect_service_proxy.ts";
import { createRunCodeTool } from "./builtin_tools/run_code.ts";
import { type LoadedSkill, loadSkillInstruction } from "./skills_loader.ts";

const APP_NAME = "antbox";

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export interface ChatOptions {
	readonly history?: ChatHistory;
	readonly files?: File[];
	readonly temperature?: number;
	readonly maxTokens?: number;
	readonly instructions?: string;
}

export interface AnswerOptions {
	readonly files?: File[];
	readonly temperature?: number;
	readonly maxTokens?: number;
	readonly instructions?: string;
}

export interface AgentsEngineContext {
	readonly agentsService: AgentsService;
	readonly nodeService: NodeService;
	readonly aspectsService: AspectsService;
	readonly defaultModel: string;
	readonly skills: LoadedSkill[];
}

// ============================================================================
// AGENTS ENGINE
// ============================================================================

/**
 * AgentsEngine - ADK-based agent execution engine.
 *
 * Uses a stateless session approach: each call creates a fresh ADK session,
 * injects conversation history as events, and runs the agent.
 *
 * Supports LLM agents and workflow orchestration agents (sequential, parallel, loop).
 */
export class AgentsEngine {
	readonly #agentsService: AgentsService;
	readonly #nodeService: NodeService;
	readonly #aspectsService: AspectsService;
	readonly #defaultModel: string;
	readonly #skills: LoadedSkill[];

	constructor(ctx: AgentsEngineContext) {
		this.#agentsService = ctx.agentsService;
		this.#nodeService = ctx.nodeService;
		this.#aspectsService = ctx.aspectsService;
		this.#defaultModel = ctx.defaultModel;
		this.#skills = ctx.skills;
	}

	/**
	 * Execute an interactive chat session with an AI agent.
	 */
	async chat(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: ChatOptions,
	): Promise<Either<AntboxError, ChatHistory>> {
		const agentOrErr = await this.#agentsService.getAgent(authContext, agentUuid);
		if (agentOrErr.isLeft()) {
			return left(agentOrErr.value);
		}

		const agentData = agentOrErr.value;
		const exposedOrErr = this.#ensureExposedToUsers(agentData, "chat");
		if (exposedOrErr.isLeft()) {
			return left(exposedOrErr.value);
		}

		try {
			const adkAgent = await this.#buildAdkAgent(agentData, authContext, options?.instructions);

			const runner = new InMemoryRunner({ agent: adkAgent, appName: APP_NAME });
			const session = await runner.sessionService.createSession({
				appName: APP_NAME,
				userId: authContext.principal.email,
			});

			// Inject prior history into the session
			const history = options?.history ?? [];
			for (const msg of history) {
				const adkEvent = createEvent({
					author: msg.role === "model" ? adkAgent.name : "user",
					content: {
						role: msg.role === "model" ? "model" : "user",
						parts: msg.parts.map((p) => ({ text: p.text ?? "" })),
					},
					invocationId: "history",
				});
				await runner.sessionService.appendEvent({ session, event: adkEvent });
			}

			// Run the agent with the new user message
			const responseText = await this.#runAndCollect(runner, {
				userId: authContext.principal.email,
				sessionId: session.id,
				newMessage: { role: "user", parts: [{ text }] },
			});

			const updatedHistory: ChatHistory = [
				...history,
				{ role: "user", parts: [{ text }] },
				{ role: "model", parts: [{ text: responseText }] },
			];

			return right(updatedHistory);
		} catch (error) {
			Logger.error("AgentsEngine.chat error:", error);
			return left(new AntboxErrorClass("AgentChatError", `Agent chat failed: ${error}`));
		}
	}

	/**
	 * Execute a one-shot answer request with an AI agent.
	 */
	async answer(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: AnswerOptions,
	): Promise<Either<AntboxError, ChatMessage>> {
		const agentOrErr = await this.#agentsService.getAgent(authContext, agentUuid);
		if (agentOrErr.isLeft()) {
			return left(agentOrErr.value);
		}

		const agentData = agentOrErr.value;
		const exposedOrErr = this.#ensureExposedToUsers(agentData, "answer");
		if (exposedOrErr.isLeft()) {
			return left(exposedOrErr.value);
		}

		try {
			const adkAgent = await this.#buildAdkAgent(agentData, authContext, options?.instructions);

			const runner = new InMemoryRunner({ agent: adkAgent, appName: APP_NAME });

			const responseText = await this.#runAndCollect(runner, {
				userId: authContext.principal.email,
				newMessage: { role: "user", parts: [{ text }] },
			});

			const message: ChatMessage = {
				role: "model",
				parts: [{ text: responseText }],
			};

			return right(message);
		} catch (error) {
			Logger.error("AgentsEngine.answer error:", error);
			return left(new AntboxErrorClass("AgentAnswerError", `Agent answer failed: ${error}`));
		}
	}

	// ========================================================================
	// PRIVATE: ADK AGENT BUILDERS
	// ========================================================================

	/**
	 * Resolves the appropriate ADK agent type based on AgentData.type.
	 * Recursively builds sub-agents for workflow types.
	 */
	async #buildAdkAgent(
		agentData: AgentData,
		authContext: AuthenticationContext,
		additionalInstructions?: string,
	): Promise<LlmAgent | SequentialAgent | ParallelAgent | LoopAgent> {
		const type = agentData.type ?? "llm";

		if (type === "llm") {
			return this.#buildLlmAgent(agentData, authContext, additionalInstructions);
		}

		// Workflow agent — resolve sub-agents recursively
		const subAgentUuids = agentData.agents ?? [];
		const subAgentDatas = await Promise.all(
			subAgentUuids.map((uuid) => this.#agentsService.getAgent(authContext, uuid)),
		);

		// Fail fast if any sub-agent is not found
		for (const result of subAgentDatas) {
			if (result.isLeft()) {
				throw new Error(`Sub-agent not found: ${result.value.message}`);
			}
		}

		const subAgents = await Promise.all(
			subAgentDatas.map((r) =>
				this.#buildAdkAgent(
					(r as { isLeft(): false; isRight(): true; value: AgentData }).value,
					authContext,
				)
			),
		);

		const name = this.#sanitizeName(agentData.name);
		const description = agentData.description ?? agentData.name;

		if (type === "sequential") {
			return new SequentialAgent({ name, description, subAgents });
		}

		if (type === "parallel") {
			return new ParallelAgent({ name, description, subAgents });
		}

		// loop — uses only the first sub-agent
		return new LoopAgent({ name, description, subAgents });
	}

	#ensureExposedToUsers(
		agentData: AgentData,
		operation: "chat" | "answer",
	): Either<ForbiddenError, void> {
		if (!agentData.exposedToUsers) {
			return left(
				new ForbiddenError(`Agent ${agentData.uuid} is not available for direct ${operation}`),
			);
		}

		return right(undefined);
	}

	async #buildLlmAgent(
		agentData: AgentData,
		authContext: AuthenticationContext,
		additionalInstructions?: string,
	): Promise<LlmAgent> {
		const model = !agentData.model || agentData.model === "default"
			? this.#defaultModel
			: agentData.model;

		const tools = await this.#buildTools(authContext, agentData);
		const instruction = this.#buildInstruction(agentData, additionalInstructions);

		return new LlmAgent({
			name: this.#sanitizeName(agentData.name),
			description: agentData.description ?? agentData.name,
			instruction,
			model,
			tools,
		});
	}

	// ========================================================================
	// PRIVATE: TOOL BUILDERS
	// ========================================================================

	async #buildTools(
		authContext: AuthenticationContext,
		agentData: AgentData,
	): Promise<FunctionTool[]> {
		const allTools = await this.#buildFunctionTools(authContext);

		// If tools is absent, pass all tools
		if (agentData.tools === undefined) {
			return allTools;
		}

		// Filter to only named tools, but keep skillLoader always available
		const allowedNames = new Set(agentData.tools);
		return allTools.filter((t) => t.name === "skillLoader" || allowedNames.has(t.name));
	}

	async #buildFunctionTools(
		authContext: AuthenticationContext,
	): Promise<FunctionTool[]> {
		const nodeProxy = new NodeServiceProxy(this.#nodeService, authContext);
		const aspectProxy = new AspectServiceProxy(this.#aspectsService, authContext);
		const runCodeFn = createRunCodeTool(nodeProxy, aspectProxy, {});
		const availableSkillsText = this.#formatAvailableSkills();

		const runCodeTool = new FunctionTool({
			name: "runCode",
			description:
				`Execute JavaScript/TypeScript code to interact with the platform. The code must be an ESM module that exports a default async function receiving { nodes, aspects }.`,
			execute: async ({ code }) => runCodeFn(code),
			parameters: z.object({
				code: z.string().describe(
					"ESM JavaScript/TypeScript module code with a default export function",
				),
			}),
		});

		const skillLoaderTool = new FunctionTool({
			name: "skillLoader",
			description:
				`Load an Agent Skill to gain more knowledge before completing the task. If you need domain-specific guidance, use this loader. Available skills are:\n${availableSkillsText}`,
			execute: async ({ name }) => {
				const skillName = String(name).trim();
				const skill = this.#skills.find((s) => s.frontmatter.name === skillName);

				if (!skill) {
					return `Skill '${skillName}' not found. Available skills are:\n${availableSkillsText}`;
				}

				const instruction = await loadSkillInstruction(skill.skillFile);
				if (!instruction) {
					return `Failed to load skill '${skillName}'.`;
				}

				return [
					`Skill '${skillName}' loaded. Add this knowledge to your context for the current task:`,
					`# ${skill.frontmatter.name}`,
					skill.frontmatter.description,
					skill.frontmatter.compatibility
						? `Compatibility: ${skill.frontmatter.compatibility}`
						: "",
					skill.frontmatter.license ? `License: ${skill.frontmatter.license}` : "",
					skill.frontmatter.metadata && Object.keys(skill.frontmatter.metadata).length > 0
						? `Metadata: ${JSON.stringify(skill.frontmatter.metadata)}`
						: "",
					"",
					instruction,
				].filter((line) => line.length > 0).join("\n");
			},
			parameters: z.object({
				name: z.string().describe("Skill name to load"),
			}),
		});

		return [runCodeTool, skillLoaderTool];
	}

	// ========================================================================
	// PRIVATE: HELPERS
	// ========================================================================

	#formatAvailableSkills(): string {
		if (this.#skills.length === 0) {
			return "- (no skills available)";
		}

		return this.#skills.map((skill) => {
			const frontmatter = skill.frontmatter;
			const optional: string[] = [];
			if (frontmatter.compatibility) {
				optional.push(`compatibility: ${frontmatter.compatibility}`);
			}
			if (frontmatter.license) {
				optional.push(`license: ${frontmatter.license}`);
			}
			if (frontmatter.metadata && Object.keys(frontmatter.metadata).length > 0) {
				optional.push(`metadata: ${JSON.stringify(frontmatter.metadata)}`);
			}
			if (frontmatter.allowedTools && frontmatter.allowedTools.length > 0) {
				optional.push(`allowed-tools: ${frontmatter.allowedTools.join(" ")}`);
			}
			const suffix = optional.length > 0 ? ` (${optional.join(", ")})` : "";
			return `- ${frontmatter.name}: ${frontmatter.description}${suffix}`;
		}).join("\n");
	}

	async #runAndCollect(
		runner: InMemoryRunner,
		params: {
			userId: string;
			sessionId?: string;
			newMessage: { role: string; parts: { text: string }[] };
		},
	): Promise<string> {
		let finalText = "";

		const runParams = params.sessionId
			? {
				userId: params.userId,
				sessionId: params.sessionId,
				newMessage: params.newMessage,
			}
			: {
				userId: params.userId,
				newMessage: params.newMessage,
			};

		const generator = params.sessionId
			? runner.runAsync(runParams as Parameters<typeof runner.runAsync>[0])
			: runner.runEphemeral(runParams as Parameters<typeof runner.runEphemeral>[0]);

		for await (const event of generator) {
			if (isFinalResponse(event) && event.content?.parts) {
				finalText = event.content.parts.map((p: { text?: string }) => p.text ?? "").join("");
				break;
			}
		}

		return finalText;
	}

	#buildInstruction(agentData: AgentData, additionalInstructions?: string): string {
		let instruction = agentData.systemPrompt ?? "";
		if (additionalInstructions) {
			instruction += `\n\n**INSTRUCTIONS**\n\n${additionalInstructions}`;
		}
		return instruction;
	}

	/**
	 * Sanitize agent name for ADK (must be alphanumeric/underscore/hyphen, no spaces)
	 */
	#sanitizeName(name: string): string {
		return name.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_");
	}
}
