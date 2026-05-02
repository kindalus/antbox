import {
	generateText,
	type LanguageModel,
	type ModelMessage,
	NoSuchToolError,
	stepCountIs,
	type Tool,
} from "ai";
import { type Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { ChatHistory, ChatMessage, TokenUsage } from "domain/ai/chat_message.ts";
import { AgentInteractionCompletedEvent } from "domain/ai/agent_interaction_completed_event.ts";
import type { EventBus } from "shared/event_bus.ts";
import { type AgentsService, resolveAgentSystemPrompt } from "./agents_service.ts";
import type { NodeService } from "../nodes/node_service.ts";
import type { AspectsService } from "../aspects/aspects_service.ts";
import type { FeaturesService } from "application/features/features_service.ts";
import { NodeServiceProxy } from "../nodes/node_service_proxy.ts";
import { type LoadedSkill } from "./skills_loader.ts";
import type { RAGService } from "./rag_service.ts";
import type { TenantLimitsEnforcer } from "application/metrics/tenant_limits_guard.ts";
import { getCustomAgent } from "application/ai/custom_agents/index.ts";
import { resolveModel as defaultResolveModel, type ResolveModelOptions } from "./resolve_model.ts";
import { buildToolSet } from "./build_tools.ts";
import {
	aisdkUsageToTokenUsage,
	chatHistoryToModelMessages,
	stepsToChatMessages,
	validateChatHistory,
} from "./messages.ts";
import type {
	AnswerOptions,
	ChatOptions,
	ChatSessionHandle,
	FeatureAIToolExecutor,
	IAgentsEngineInternal,
} from "./agents_engine_interface.ts";
import { type SessionSnapshot, SessionStore } from "./session_store.ts";

const AGENT_DEBUG_TRACE_ENV = "ANTBOX_AGENT_DEBUG_TRACE";
const DEFAULT_MAX_LLM_CALLS = 6;
const FINAL_ANSWER_INSTRUCTION = [
	"Use the previous tool results to answer the user's request.",
	"Do not call tools. Return only the final answer for the user.",
].join(" ");
const FALLBACK_FINAL_ANSWER = "I found tool results, but could not synthesize a final answer.";

interface AgentRunOutput {
	readonly text: string;
	readonly usage?: TokenUsage;
	readonly messages: ChatMessage[];
}

export interface AgentsEngineContext {
	readonly agentsService: AgentsService;
	readonly featuresService: FeaturesService;
	readonly nodeService: NodeService;
	readonly aspectsService: AspectsService;
	readonly ragService?: RAGService;
	readonly defaultModel: string;
	readonly skills: LoadedSkill[];
	readonly eventBus: EventBus;
	readonly tenantLimitsGuard?: TenantLimitsEnforcer;
	readonly modelOptions?: ResolveModelOptions;
	readonly sessionStore?: SessionStore;
	readonly resolveLanguageModel?: (
		modelString: string,
		options?: ResolveModelOptions,
	) => LanguageModel;
}

function isAgentDebugTraceEnabled(): boolean {
	const value = Deno.env.get(AGENT_DEBUG_TRACE_ENV)?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

function redactError(error: unknown): { name: string; message: string } {
	if (error instanceof Error) {
		return { name: error.name, message: error.message };
	}
	return { name: "UnknownError", message: String(error) };
}

function combineUsage(...usages: Array<TokenUsage | undefined>): TokenUsage | undefined {
	const present = usages.filter((usage): usage is TokenUsage => usage !== undefined);
	if (present.length === 0) return undefined;
	return present.reduce<TokenUsage>(
		(total, usage) => ({
			promptTokens: total.promptTokens + usage.promptTokens,
			completionTokens: total.completionTokens + usage.completionTokens,
			totalTokens: total.totalTokens + usage.totalTokens,
		}),
		{ promptTokens: 0, completionTokens: 0, totalTokens: 0 },
	);
}

function endsWithToolMessage(messages: readonly ChatMessage[]): boolean {
	return messages.at(-1)?.role === "tool";
}

function ensureTerminalModelMessage(result: AgentRunOutput): AgentRunOutput {
	if (!endsWithToolMessage(result.messages)) return result;
	const text = result.text.trim() || FALLBACK_FINAL_ANSWER;
	return {
		...result,
		text,
		messages: [...result.messages, { role: "model", parts: [{ text }] }],
	};
}

/**
 * AgentsEngine — Vercel AI SDK-based agent execution engine.
 *
 * Stateless: each call resolves an AgentData snapshot, builds tools, replays history
 * as ModelMessage[], and runs `generateText` with multi-step tool use.
 */
export class AgentsEngine implements IAgentsEngineInternal {
	readonly #agentsService: AgentsService;
	readonly #featuresService: FeaturesService;
	readonly #nodeService: NodeService;
	readonly #aspectsService: AspectsService;
	readonly #defaultModel: string;
	readonly #skills: LoadedSkill[];
	readonly #ragService?: RAGService;
	readonly #eventBus: EventBus;
	readonly #tenantLimitsGuard?: TenantLimitsEnforcer;
	readonly #modelOptions?: ResolveModelOptions;
	readonly #sessionStore: SessionStore;
	readonly #resolveLanguageModel: (
		modelString: string,
		options?: ResolveModelOptions,
	) => LanguageModel;
	#featureAIToolExecutor?: FeatureAIToolExecutor;

	constructor(ctx: AgentsEngineContext) {
		this.#agentsService = ctx.agentsService;
		this.#featuresService = ctx.featuresService;
		this.#nodeService = ctx.nodeService;
		this.#aspectsService = ctx.aspectsService;
		this.#defaultModel = ctx.defaultModel;
		this.#skills = ctx.skills;
		this.#ragService = ctx.ragService;
		this.#eventBus = ctx.eventBus;
		this.#tenantLimitsGuard = ctx.tenantLimitsGuard;
		this.#modelOptions = ctx.modelOptions;
		this.#sessionStore = ctx.sessionStore ?? new SessionStore();
		this.#resolveLanguageModel = ctx.resolveLanguageModel ?? defaultResolveModel;
	}

	setFeatureAIToolExecutor(executor: FeatureAIToolExecutor) {
		this.#featureAIToolExecutor = executor;
	}

	async listAvailableToolNames(
		authContext: AuthenticationContext,
		agentData: AgentData,
	): Promise<Either<AntboxError, string[]>> {
		const built = await buildToolSet(
			{
				nodeService: this.#nodeService,
				aspectsService: this.#aspectsService,
				featuresService: this.#featuresService,
				ragService: this.#ragService,
				skills: this.#skills,
				featureAIToolExecutor: this.#featureAIToolExecutor,
			},
			agentData,
			authContext,
		);
		if (built.isLeft()) return left(built.value);
		return right(built.value.toolNames);
	}

	async chat(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: ChatOptions,
	): Promise<Either<AntboxError, ChatHistory>> {
		return this.#publicChat(authContext, agentUuid, text, options, false);
	}

	async answer(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: AnswerOptions,
	): Promise<Either<AntboxError, ChatMessage>> {
		return this.#publicAnswer(authContext, agentUuid, text, options, false);
	}

	async runInternalChat(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: ChatOptions,
	): Promise<Either<AntboxError, ChatHistory>> {
		return this.#publicChat(authContext, agentUuid, text, options, true);
	}

	async runInternalAnswer(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: AnswerOptions,
	): Promise<Either<AntboxError, ChatMessage>> {
		return this.#publicAnswer(authContext, agentUuid, text, options, true);
	}

	async openChatSession(
		authContext: AuthenticationContext,
		agentUuid: string,
	): Promise<Either<AntboxError, ChatSessionHandle>> {
		const agentOrErr = await this.#agentsService.getAgent(authContext, agentUuid);
		if (agentOrErr.isLeft()) return left(agentOrErr.value);

		const agentData = agentOrErr.value;
		if (agentData.exposedToUsers === false) {
			return left(
				new AntboxError(
					"Forbidden",
					`Agent ${agentData.name} is not available for chat sessions`,
				),
			);
		}

		const builtOrErr = await buildToolSet(
			{
				nodeService: this.#nodeService,
				aspectsService: this.#aspectsService,
				featuresService: this.#featuresService,
				ragService: this.#ragService,
				skills: this.#skills,
				featureAIToolExecutor: this.#featureAIToolExecutor,
			},
			agentData,
			authContext,
		);
		if (builtOrErr.isLeft()) return left(builtOrErr.value);

		const sessionId = crypto.randomUUID();
		const snapshot = this.#sessionStore.put({
			sessionId,
			tenant: authContext.tenant,
			userEmail: authContext.principal.email,
			agentUuid,
			agentData,
			tools: builtOrErr.value.tools,
			toolNames: builtOrErr.value.toolNames,
		});

		return right({
			sessionId: snapshot.sessionId,
			toolNames: snapshot.toolNames,
			expiresAt: snapshot.expiresAt,
		});
	}

	closeChatSession(sessionId: string): boolean {
		return this.#sessionStore.delete(sessionId);
	}

	#findStaleHistoryTool(history: ChatHistory, toolNames: readonly string[]): string | undefined {
		const allowed = new Set(toolNames);
		for (const message of history) {
			if (message.role !== "model") continue;
			for (const part of message.parts) {
				const name = part.toolCall?.name;
				if (name && !allowed.has(name)) return name;
			}
		}
		return undefined;
	}

	async #publicChat(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options: ChatOptions | undefined,
		internal: boolean,
	): Promise<Either<AntboxError, ChatHistory>> {
		const interactionOrErr = await this.#runInteraction(authContext, agentUuid, text, {
			history: options?.history,
			instructions: options?.instructions,
			sessionId: options?.sessionId,
			interactionType: "chat",
			internal,
		});
		if (interactionOrErr.isLeft()) return left(interactionOrErr.value);

		const history = options?.history ?? [];
		const out = interactionOrErr.value;
		return right([
			...history,
			{ role: "user", parts: [{ text }] },
			...out.messages.map((message, index) =>
				index === out.messages.length - 1 && message.role === "model"
					? { ...message, usage: out.usage ?? message.usage }
					: message
			),
		]);
	}

	async #publicAnswer(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options: AnswerOptions | undefined,
		internal: boolean,
	): Promise<Either<AntboxError, ChatMessage>> {
		const interactionOrErr = await this.#runInteraction(authContext, agentUuid, text, {
			history: [],
			instructions: options?.instructions,
			sessionId: options?.sessionId,
			interactionType: "answer",
			internal,
		});
		if (interactionOrErr.isLeft()) return left(interactionOrErr.value);

		return right({
			role: "model",
			parts: [{ text: interactionOrErr.value.text }],
			usage: interactionOrErr.value.usage,
		});
	}

	async #runInteraction(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options: {
			history?: ChatHistory;
			instructions?: string;
			sessionId?: string;
			interactionType: "chat" | "answer";
			internal: boolean;
		},
	): Promise<Either<AntboxError, AgentRunOutput>> {
		let session: SessionSnapshot | undefined;
		let agentData: AgentData;

		if (options.sessionId) {
			session = this.#sessionStore.get(options.sessionId);
			if (!session) {
				return left(
					new AntboxError(
						"InvalidSession",
						`Session '${options.sessionId}' not found or expired`,
					),
				);
			}
			if (session.tenant !== authContext.tenant || session.agentUuid !== agentUuid) {
				return left(
					new AntboxError(
						"InvalidSession",
						`Session '${options.sessionId}' does not match tenant/agent`,
					),
				);
			}
			agentData = session.agentData;
		} else {
			const agentOrErr = await this.#agentsService.getAgent(authContext, agentUuid);
			if (agentOrErr.isLeft()) return left(agentOrErr.value);
			agentData = agentOrErr.value;
		}

		if (!options.internal && agentData.exposedToUsers === false) {
			return left(
				new AntboxError(
					"Forbidden",
					`Agent ${agentData.name} is not available for direct ${options.interactionType}`,
				),
			);
		}

		const limitsOrErr = await this.#tenantLimitsGuard?.ensureCanRunAgent() ?? right(undefined);
		if (limitsOrErr.isLeft()) return left(limitsOrErr.value);

		const history = options.history ?? [];
		const validation = validateChatHistory(history);
		if (validation.isLeft()) return left(validation.value);

		if (session) {
			const staleTool = this.#findStaleHistoryTool(history, session.toolNames);
			if (staleTool) {
				return left(
					new AntboxError(
						"StaleHistoryTool",
						`History references tool '${staleTool}' which is not in this session's tool snapshot`,
					),
				);
			}
		}

		const debugLogger = isAgentDebugTraceEnabled()
			? Logger.instance(
				"AgentsEngine",
				`tenant=${authContext.tenant}`,
				`agent=${agentData.uuid}`,
			)
			: undefined;

		try {
			const customAgent = getCustomAgent(agentUuid);
			const messages: ModelMessage[] = [
				...chatHistoryToModelMessages(history),
				{ role: "user", content: text },
			];

			let result: AgentRunOutput;

			if (customAgent) {
				const created = customAgent.create({
					sdk: {
						nodes: new NodeServiceProxy(this.#nodeService, this.#ragService, authContext),
					},
					authContext,
					defaultModel: this.#defaultModel,
					additionalInstructions: options.instructions,
				});
				const out = await (created as unknown as {
					run: (input: {
						messages: ModelMessage[];
						userText: string;
						additionalInstructions?: string;
					}) => Promise<{ text: string; usage?: TokenUsage; messages: ChatMessage[] }>;
				}).run({
					messages,
					userText: text,
					additionalInstructions: options.instructions,
				});
				result = out;
			} else {
				result = await this.#runLlmAgent(
					agentData,
					authContext,
					messages,
					options.instructions,
					options.interactionType,
					text,
					debugLogger,
					session,
				);
			}

			result = ensureTerminalModelMessage(result);

			if (result.usage) {
				this.#eventBus.publish(
					new AgentInteractionCompletedEvent(
						authContext.principal.email,
						authContext.tenant,
						{
							agentUuid,
							usage: result.usage,
							interactionType: options.interactionType,
						},
					),
				);
			}

			return right(result);
		} catch (error) {
			const summary = redactError(error);
			Logger.error(`AgentsEngine.${options.interactionType} error:`, summary);
			return left(
				new AntboxError(
					options.interactionType === "chat" ? "AgentChatError" : "AgentAnswerError",
					`Agent ${options.interactionType} failed: ${summary.name}: ${summary.message}`,
				),
			);
		}
	}

	async #runLlmAgent(
		agentData: AgentData,
		authContext: AuthenticationContext,
		messages: ModelMessage[],
		additionalInstructions: string | undefined,
		interactionType: "chat" | "answer",
		userText: string,
		debugLogger?: Logger,
		session?: SessionSnapshot,
	): Promise<AgentRunOutput> {
		let tools: Record<string, Tool>;
		let toolNames: readonly string[];
		if (session) {
			tools = session.tools;
			toolNames = session.toolNames;
		} else {
			const builtOrErr = await buildToolSet(
				{
					nodeService: this.#nodeService,
					aspectsService: this.#aspectsService,
					featuresService: this.#featuresService,
					ragService: this.#ragService,
					skills: this.#skills,
					featureAIToolExecutor: this.#featureAIToolExecutor,
				},
				agentData,
				authContext,
			);
			if (builtOrErr.isLeft()) throw builtOrErr.value;
			tools = builtOrErr.value.tools;
			toolNames = builtOrErr.value.toolNames;
		}

		const modelString = !agentData.model || agentData.model === "default"
			? this.#defaultModel
			: agentData.model;
		const model = this.#resolveLanguageModel(modelString, this.#modelOptions);

		const instruction = this.#buildInstruction(
			agentData,
			toolNames,
			additionalInstructions,
		);

		if (debugLogger) {
			debugLogger.debug(
				"agent_debug_trace_start",
				JSON.stringify({
					type: "agent_run_start",
					agentUuid: agentData.uuid,
					agentName: agentData.name,
					model: modelString,
					interactionType,
					toolNames,
					userText,
					additionalInstructions,
					instructionLength: instruction.length,
				}),
			);
		}

		const maxLlmCalls = agentData.maxLlmCalls ?? DEFAULT_MAX_LLM_CALLS;
		const stopWhen = stepCountIs(maxLlmCalls);

		const result = await generateText({
			model,
			system: instruction,
			messages,
			tools: tools as Record<string, Tool>,
			stopWhen,
			onStepFinish: debugLogger
				? (step) =>
					debugLogger.debug(
						"agent_debug_trace_event",
						JSON.stringify({
							type: "agent_run_event",
							finishReason: step.finishReason,
							textLength: step.text?.length ?? 0,
							toolCallCount: step.toolCalls?.length ?? 0,
							toolResponseCount: step.toolResults?.length ?? 0,
							usage: aisdkUsageToTokenUsage(step.usage),
						}),
					)
				: undefined,
		});

		let finalText = result.text ?? "";
		let usage = aisdkUsageToTokenUsage(result.totalUsage ?? result.usage);
		const stepMessages = stepsToChatMessages(result.steps ?? []);

		if (endsWithToolMessage(stepMessages)) {
			const synthesized = await this.#synthesizeFinalAnswer(
				model,
				instruction,
				messages,
				stepMessages,
				debugLogger,
			);
			finalText = synthesized.text;
			usage = combineUsage(usage, synthesized.usage);
			stepMessages.push({ role: "model", parts: [{ text: finalText }] });
		}

		if (debugLogger) {
			debugLogger.debug(
				"agent_debug_trace_end",
				JSON.stringify({
					type: "agent_run_end",
					finalTextLength: finalText.length,
					messageCount: stepMessages.length,
					usage,
				}),
			);
		}

		return { text: finalText, usage, messages: stepMessages };
	}

	async #synthesizeFinalAnswer(
		model: LanguageModel,
		instruction: string,
		originalMessages: ModelMessage[],
		generatedMessages: ChatMessage[],
		debugLogger?: Logger,
	): Promise<{ text: string; usage?: TokenUsage }> {
		const synthesisMessages: ModelMessage[] = [
			...originalMessages,
			...chatHistoryToModelMessages(generatedMessages),
			{ role: "user", content: FINAL_ANSWER_INSTRUCTION },
		];

		if (debugLogger) {
			debugLogger.debug(
				"agent_debug_trace_event",
				JSON.stringify({ type: "agent_final_answer_synthesis_start" }),
			);
		}

		const result = await generateText({
			model,
			system: instruction,
			messages: synthesisMessages,
		});
		const text = (result.text ?? "").trim() || FALLBACK_FINAL_ANSWER;
		const usage = aisdkUsageToTokenUsage(result.totalUsage ?? result.usage);

		if (debugLogger) {
			debugLogger.debug(
				"agent_debug_trace_event",
				JSON.stringify({
					type: "agent_final_answer_synthesis_end",
					textLength: text.length,
					usage,
				}),
			);
		}

		return { text, usage };
	}

	#buildInstruction(
		agentData: AgentData,
		toolNames: readonly string[],
		additionalInstructions?: string,
	): string {
		let instruction = resolveAgentSystemPrompt(agentData.systemPrompt);

		if (additionalInstructions) {
			instruction += `\n\n**INSTRUCTIONS**\n\n${additionalInstructions}`;
		}

		if (toolNames.includes("load_skill")) {
			const skillsPrompt = this.#formatAvailableSkills(agentData.skills);
			if (skillsPrompt.length > 0) {
				instruction += `\n\n${skillsPrompt}`;
			}
		}

		return instruction;
	}

	#formatAvailableSkills(allowList?: string[]): string {
		const allow = allowList && allowList.length > 0 ? new Set(allowList) : undefined;
		const skills = allow
			? this.#skills.filter((s) => allow.has(s.frontmatter.name))
			: this.#skills;
		if (skills.length === 0) return "";

		const lines = [
			"The following skills provide specialized instructions for specific tasks.",
			"Use the load_skill tool to load a skill when the task matches its description.",
			"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md).",
			"",
			"<available_skills>",
		];

		for (const skill of skills) {
			lines.push("  <skill>");
			lines.push(`    <name>${skill.frontmatter.name}</name>`);
			lines.push(`    <description>${skill.frontmatter.description}</description>`);
			lines.push(`    <location>${skill.skillFile}</location>`);
			lines.push("  </skill>");
		}

		lines.push("</available_skills>");
		return lines.join("\n");
	}
}

// Re-export error type so consumers don't need to know about NoSuchToolError specifically
export { NoSuchToolError };
