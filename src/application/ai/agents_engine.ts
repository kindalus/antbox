import {
	type BaseAgent,
	createEvent,
	type Event,
	FunctionTool,
	getFunctionCalls,
	getFunctionResponses,
	InMemoryRunner,
	isFinalResponse,
	LlmAgent,
	stringifyContent,
} from "@google/adk";
import type { RunConfig } from "@google/adk";
import { z } from "zod";
import { type Either, left, right } from "shared/either.ts";
import { AntboxError, AntboxError as AntboxErrorClass } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type {
	ChatHistory,
	ChatMessage,
	ChatMessagePart,
	TokenUsage,
} from "domain/ai/chat_message.ts";
import { AgentInteractionCompletedEvent } from "domain/ai/agent_interaction_completed_event.ts";
import type { EventBus } from "shared/event_bus.ts";
import { type AgentsService, resolveAgentSystemPrompt } from "./agents_service.ts";
import type { NodeService } from "../nodes/node_service.ts";
import type { AspectsService } from "../aspects/aspects_service.ts";
import { NodeServiceProxy } from "../nodes/node_service_proxy.ts";
import { AspectServiceProxy } from "../aspects/aspect_service_proxy.ts";
import { createRunCodeTool } from "./builtin_tools/run_code.ts";
import { type LoadedSkill, loadSkillInstruction } from "./skills_loader.ts";
import { RAGService } from "./rag_service.ts";
import type { TenantLimitsEnforcer } from "application/metrics/tenant_limits_guard.ts";
import { getCustomAgent } from "application/ai/custom_agents/index.ts";
import { RAG_AGENT_UUID } from "application/ai/builtin_agents/rag_agent.ts";
import type { FeaturesService } from "application/features/features_service.ts";
import type { FeatureData, FeatureParameter } from "domain/configuration/feature_data.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";

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
	readonly featuresService: FeaturesService;
	readonly nodeService: NodeService;
	readonly aspectsService: AspectsService;
	readonly ragService?: RAGService;
	readonly defaultModel: string;
	readonly skills: LoadedSkill[];
	readonly eventBus: EventBus;
	readonly tenantLimitsGuard?: TenantLimitsEnforcer;
}

export interface FeatureAIToolExecutor {
	runAITool<T>(
		authContext: AuthenticationContext,
		uuid: string,
		parameters: Record<string, unknown>,
	): Promise<Either<AntboxError, T>>;
}

export interface ToolSelectionEntry {
	name: string;
	allowlistNames?: string[];
}

const DEFAULT_AGENT_TOOL_NAME = "load_skill";
const AGENT_DEBUG_TRACE_ENV = "ANTBOX_AGENT_DEBUG_TRACE";
const NODE_FILTER_OPERATORS = [
	"==",
	"<=",
	">=",
	"<",
	">",
	"!=",
	"in",
	"not-in",
	"match",
	"contains",
	"contains-all",
	"contains-any",
	"not-contains",
	"contains-none",
] as const;

const nodeFilterSchema = z.tuple([
	z.string().min(1),
	z.enum(NODE_FILTER_OPERATORS),
	z.unknown(),
]);

const nodeFiltersSchema = z.union([
	z.string().min(1),
	z.array(nodeFilterSchema).min(1),
	z.array(z.array(nodeFilterSchema).min(1)).min(1),
]);

function toSnakeCase(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();
}

function matchesToolName(tool: ToolSelectionEntry, candidate: string): boolean {
	return tool.name === candidate || tool.allowlistNames?.includes(candidate) === true;
}

function safeStringify(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function truncateDebugText(value: string, maxLength = 500): string {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength)}…`;
}

function isAgentDebugTraceEnabled(): boolean {
	const value = Deno.env.get(AGENT_DEBUG_TRACE_ENV)?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

function usageMetadataToTokenUsage(
	usageMetadata?: {
		promptTokenCount?: number | null;
		candidatesTokenCount?: number | null;
		totalTokenCount?: number | null;
	},
): TokenUsage | undefined {
	if (!usageMetadata) {
		return undefined;
	}

	return {
		promptTokens: usageMetadata.promptTokenCount ?? 0,
		completionTokens: usageMetadata.candidatesTokenCount ?? 0,
		totalTokens: usageMetadata.totalTokenCount ?? 0,
	};
}

export function normalizeToolResult<T>(value: T): T | { results: T } {
	return Array.isArray(value) ? { results: value } : value;
}

export function buildAgentDebugRunTrace(
	params: {
		agentUuid: string;
		agentName: string;
		model: string;
		instruction: string;
		toolNames: string[];
		interactionType: "chat" | "answer";
		userText: string;
		additionalInstructions?: string;
	},
): Record<string, unknown> {
	return {
		type: "agent_run_start",
		agentUuid: params.agentUuid,
		agentName: params.agentName,
		model: params.model,
		interactionType: params.interactionType,
		toolNames: params.toolNames,
		userText: params.userText,
		additionalInstructions: params.additionalInstructions,
		instructionLength: params.instruction.length,
		instruction: params.instruction,
	};
}

export function summarizeAgentDebugEvent(event: Event): Record<string, unknown> {
	const text = stringifyContent(event).trim();
	const functionCalls = getFunctionCalls(event).map((call) => ({
		id: call.id,
		name: call.name,
		argsKeys: Object.keys((call.args ?? {}) as Record<string, unknown>),
		argsPreview: truncateDebugText(safeStringify(call.args ?? {}), 300),
	}));
	const functionResponses = getFunctionResponses(event).map((response) => {
		const responseText = safeStringify(response.response);
		return {
			id: response.id,
			name: response.name,
			responseLength: responseText.length,
			responsePreview: truncateDebugText(responseText, 300),
		};
	});

	return {
		type: "agent_run_event",
		id: event.id,
		invocationId: event.invocationId,
		author: event.author,
		branch: event.branch,
		timestamp: event.timestamp,
		contentRole: event.content?.role,
		isFinalResponse: isFinalResponse(event),
		finishReason: event.finishReason ? String(event.finishReason) : undefined,
		errorCode: event.errorCode,
		errorMessage: event.errorMessage,
		textLength: text.length,
		textPreview: truncateDebugText(text, 300),
		toolCallCount: functionCalls.length,
		toolCalls: functionCalls,
		toolResponseCount: functionResponses.length,
		toolResponses: functionResponses,
		usage: usageMetadataToTokenUsage(event.usageMetadata),
	};
}

function shouldTraceAgentDebugEvent(event: Event): boolean {
	return isFinalResponse(event) ||
		getFunctionCalls(event).length > 0 ||
		getFunctionResponses(event).length > 0 ||
		event.errorCode !== undefined ||
		event.errorMessage !== undefined;
}

export function eventToChatMessages(
	event: Event,
	options: { includeText?: boolean } = {},
): ChatMessage[] {
	const messages: ChatMessage[] = [];
	const modelParts: ChatMessagePart[] = [];
	const toolParts: ChatMessagePart[] = [];
	const userParts: ChatMessagePart[] = [];

	for (const functionCall of getFunctionCalls(event)) {
		if (!functionCall.name) {
			continue;
		}
		modelParts.push({
			toolCall: {
				id: functionCall.id,
				name: functionCall.name,
				args: (functionCall.args ?? {}) as Record<string, unknown>,
			},
		});
	}

	for (const functionResponse of getFunctionResponses(event)) {
		if (!functionResponse.name) {
			continue;
		}
		toolParts.push({
			toolResponse: {
				id: functionResponse.id,
				name: functionResponse.name,
				text: safeStringify(functionResponse.response),
			},
		});
	}

	if (options.includeText !== false) {
		const text = stringifyContent(event).trim();
		if (text.length > 0) {
			const targetParts = event.content?.role === "user" ? userParts : modelParts;
			targetParts.push({ text });
		}
	}

	if (userParts.length > 0) {
		messages.push({ role: "user", parts: userParts });
	}
	if (modelParts.length > 0) {
		messages.push({ role: "model", parts: modelParts });
	}
	if (toolParts.length > 0) {
		messages.push({ role: "tool", parts: toolParts });
	}

	return messages;
}

export function chatMessageToEvent(
	msg: ChatMessage,
	agentName: string,
	invocationId = "history",
): Event {
	const parts = msg.parts.flatMap((part) => {
		const mappedParts: Array<Record<string, unknown>> = [];
		if (part.text !== undefined) {
			mappedParts.push({ text: part.text });
		}
		if (part.toolCall) {
			mappedParts.push({
				functionCall: {
					id: part.toolCall.id,
					name: part.toolCall.name,
					args: part.toolCall.args,
				},
			});
		}
		if (part.toolResponse) {
			mappedParts.push({
				functionResponse: {
					id: part.toolResponse.id,
					name: part.toolResponse.name,
					response: { result: part.toolResponse.text },
				},
			});
		}
		return mappedParts;
	});

	return createEvent({
		author: msg.role === "user" ? "user" : agentName,
		content: {
			role: msg.role === "model" ? "model" : "user",
			parts,
		},
		invocationId,
	});
}

export function selectAgentTools<T extends ToolSelectionEntry>(
	allTools: T[],
	tools: AgentData["tools"],
): T[] {
	if (tools === true) {
		return allTools;
	}

	const isDefaultTool = (tool: T) => matchesToolName(tool, DEFAULT_AGENT_TOOL_NAME);
	if (tools === false || tools === undefined || tools.length === 0) {
		return allTools.filter(isDefaultTool);
	}

	const allowedNames = new Set(tools);
	return allTools.filter((tool) => {
		if (isDefaultTool(tool)) {
			return true;
		}

		for (const allowedName of allowedNames) {
			if (matchesToolName(tool, allowedName)) {
				return true;
			}
		}

		return false;
	});
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
 * Supports LLM agents with built-in tools, feature-backed AI tools, and custom coded agents.
 */
export class AgentsEngine {
	readonly #agentsService: AgentsService;
	readonly #featuresService: FeaturesService;
	readonly #nodeService: NodeService;
	readonly #aspectsService: AspectsService;
	readonly #defaultModel: string;
	readonly #skills: LoadedSkill[];
	readonly #ragService?: RAGService;
	readonly #eventBus: EventBus;
	readonly #tenantLimitsGuard?: TenantLimitsEnforcer;
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
	}

	setFeatureAIToolExecutor(executor: FeatureAIToolExecutor) {
		this.#featureAIToolExecutor = executor;
	}

	async listAvailableToolNames(
		authContext: AuthenticationContext,
		agentData: AgentData,
	): Promise<Either<AntboxError, string[]>> {
		try {
			const tools = await this.#buildTools(authContext, agentData);
			return right(tools.map((tool) => tool.name));
		} catch (error) {
			return left(
				(error as AntboxError).errorCode
					? (error as AntboxError)
					: new AntboxErrorClass("AgentToolsError", `Failed to build tools: ${error}`),
			);
		}
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
		const interactionOrErr = await this.#runInteraction(authContext, agentUuid, text, {
			history: options?.history,
			instructions: options?.instructions,
			interactionType: "chat",
		});
		if (interactionOrErr.isLeft()) {
			return left(interactionOrErr.value);
		}

		const history = options?.history ?? [];
		return right([
			...history,
			{ role: "user", parts: [{ text }] },
			...interactionOrErr.value.messages.map((message, index) =>
				index === interactionOrErr.value.messages.length - 1 && message.role === "model"
					? { ...message, usage: interactionOrErr.value.usage ?? message.usage }
					: message
			),
		]);
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
		const interactionOrErr = await this.#runInteraction(authContext, agentUuid, text, {
			history: [],
			instructions: options?.instructions,
			interactionType: "answer",
		});
		if (interactionOrErr.isLeft()) {
			return left(interactionOrErr.value);
		}

		return right({
			role: "model",
			parts: [{ text: interactionOrErr.value.text }],
			usage: interactionOrErr.value.usage,
		});
	}

	// ========================================================================
	// PRIVATE: ADK AGENT BUILDERS
	// ========================================================================

	async #runInteraction(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options: {
			history?: ChatHistory;
			instructions?: string;
			interactionType: "chat" | "answer";
		},
	): Promise<Either<AntboxError, { text: string; usage?: TokenUsage; messages: ChatMessage[] }>> {
		const agentOrErr = await this.#agentsService.getAgent(authContext, agentUuid);
		if (agentOrErr.isLeft()) {
			return left(agentOrErr.value);
		}

		const agentData = agentOrErr.value;
		if (agentData.exposedToUsers === false) {
			return left(
				new AntboxErrorClass(
					"Forbidden",
					`Agent ${agentData.name} is not available for direct ${options.interactionType}`,
				),
			);
		}

		const limitsOrErr = await this.#tenantLimitsGuard?.ensureCanRunAgent() ?? right(undefined);
		if (limitsOrErr.isLeft()) {
			return left(limitsOrErr.value);
		}

		try {
			const debugLogger = isAgentDebugTraceEnabled()
				? Logger.instance(
					"AgentsEngine",
					`tenant=${authContext.tenant}`,
					`agent=${agentData.uuid}`,
				)
				: undefined;
			const adkAgent = await this.#buildAdkAgent(
				agentData,
				authContext,
				options.instructions,
				debugLogger,
				options.interactionType,
				text,
			);
			const runner = new InMemoryRunner({ agent: adkAgent, appName: APP_NAME });
			const history = options.history ?? [];
			let sessionId: string | undefined;
			if (history.length > 0) {
				const session = await runner.sessionService.createSession({
					appName: APP_NAME,
					userId: authContext.principal.email,
				});
				sessionId = session.id;
				for (const [index, msg] of history.entries()) {
					const adkEvent = chatMessageToEvent(msg, adkAgent.name, `history-${index + 1}`);
					await runner.sessionService.appendEvent({ session, event: adkEvent });
				}
			}

			const runConfig = agentData.maxLlmCalls
				? { maxLlmCalls: agentData.maxLlmCalls } as RunConfig
				: undefined;
			const result = await this.#runAndCollect(
				runner,
				{
					userId: authContext.principal.email,
					sessionId,
					newMessage: { role: "user", parts: [{ text }] },
				},
				runConfig,
				debugLogger,
			);

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
			Logger.error(`AgentsEngine.${options.interactionType} error:`, error);
			return left(
				new AntboxErrorClass(
					options.interactionType === "chat" ? "AgentChatError" : "AgentAnswerError",
					`Agent ${options.interactionType} failed: ${error}`,
				),
			);
		}
	}

	async #buildAdkAgent(
		agentData: AgentData,
		authContext: AuthenticationContext,
		additionalInstructions?: string,
		debugLogger?: Logger,
		interactionType?: "chat" | "answer",
		userText?: string,
	): Promise<BaseAgent> {
		const customAgent = getCustomAgent(agentData.uuid);
		if (customAgent) {
			return customAgent.create({
				sdk: {
					nodes: new NodeServiceProxy(this.#nodeService, this.#ragService, authContext),
				},
				authContext,
				defaultModel: this.#defaultModel,
				additionalInstructions,
			});
		}

		return this.#buildLlmAgent(
			agentData,
			authContext,
			additionalInstructions,
			debugLogger,
			interactionType,
			userText,
		);
	}

	async #buildLlmAgent(
		agentData: AgentData,
		authContext: AuthenticationContext,
		additionalInstructions?: string,
		debugLogger?: Logger,
		interactionType?: "chat" | "answer",
		userText?: string,
	): Promise<LlmAgent> {
		const model = !agentData.model || agentData.model === "default"
			? this.#defaultModel
			: agentData.model;

		const tools = await this.#buildTools(authContext, agentData);
		const instruction = this.#buildInstruction(agentData, additionalInstructions);
		if (debugLogger && interactionType && userText !== undefined) {
			debugLogger.debug(
				"agent_debug_trace_start",
				JSON.stringify(
					buildAgentDebugRunTrace({
						agentUuid: agentData.uuid,
						agentName: agentData.name,
						model,
						instruction,
						toolNames: tools.map((tool) => tool.name),
						interactionType,
						userText,
						additionalInstructions,
					}),
				),
			);
		}

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
		const selectedTools = selectAgentTools(allTools, agentData.tools);
		const filteredTools = agentData.uuid === RAG_AGENT_UUID
			? selectedTools.filter((tool) =>
				tool.name === "semantic_search" || matchesToolName(tool, DEFAULT_AGENT_TOOL_NAME)
			)
			: selectedTools;
		return filteredTools.map((tool) => tool.tool);
	}

	async #buildFunctionTools(
		authContext: AuthenticationContext,
	): Promise<Array<{ tool: FunctionTool; name: string; allowlistNames: string[] }>> {
		const nodeProxy = new NodeServiceProxy(this.#nodeService, this.#ragService, authContext);
		const aspectProxy = new AspectServiceProxy(this.#aspectsService, authContext);
		const runCodeFn = createRunCodeTool(nodeProxy, aspectProxy, {});

		const builtInTools: Array<{ tool: FunctionTool; name: string; allowlistNames: string[] }> = [
			{
				name: "run_code",
				allowlistNames: ["run_code", "runCode"],
				tool: new FunctionTool({
					name: "run_code",
					description:
						"Execute JavaScript/TypeScript code for advanced multi-step workflows involving nodes and aspects.",
					execute: async ({ code }) => runCodeFn(code),
					parameters: z.object({
						code: z.string().describe(
							"ESM JavaScript/TypeScript module code with a default export function",
						),
					}),
				}),
			},
			{
				name: "find_nodes",
				allowlistNames: ["find_nodes"],
				tool: new FunctionTool({
					name: "find_nodes",
					description: "Find nodes using structured filters or plain-text search.",
					execute: async ({ filters, page_size, page_token }) => {
						const result = await nodeProxy.find(
							filters as NodeFilters | string,
							page_size,
							page_token,
						);
						if (result.isLeft()) {
							throw new Error(result.value.message);
						}
						return result.value;
					},
					parameters: z.object({
						filters: nodeFiltersSchema.describe(
							"Structured node filters or plain-text search string",
						),
						page_size: z.number().int().min(1).max(200).optional(),
						page_token: z.number().int().min(1).optional(),
					}),
				}),
			},
			{
				name: "get_node",
				allowlistNames: ["get_node"],
				tool: new FunctionTool({
					name: "get_node",
					description: "Get a single node by UUID.",
					execute: async ({ uuid }) => {
						const result = await nodeProxy.get(uuid);
						if (result.isLeft()) {
							throw new Error(result.value.message);
						}
						return result.value;
					},
					parameters: z.object({
						uuid: z.string().min(1),
					}),
				}),
			},
			{
				name: "semantic_search",
				allowlistNames: ["semantic_search"],
				tool: new FunctionTool({
					name: "semantic_search",
					description: "Run semantic search over indexed node content.",
					execute: async ({ query }) => {
						const result = await nodeProxy.semanticQuery(query);
						if (result.isLeft()) {
							throw new Error(
								result.value instanceof Error ? result.value.message : String(result.value),
							);
						}
						return normalizeToolResult(result.value);
					},
					parameters: z.object({
						query: z.string().min(1),
					}),
				}),
			},
			{
				name: "load_skill",
				allowlistNames: ["load_skill", "skillLoader"],
				tool: new FunctionTool({
					name: "load_skill",
					description: "Load a discovered skill by name to get its full instructions.",
					execute: async ({ name }) => {
						const skillName = String(name).trim();
						const skill = this.#skills.find((s) => s.frontmatter.name === skillName);
						if (!skill) {
							throw new Error(`Skill '${skillName}' not found`);
						}

						const instruction = await loadSkillInstruction(skill.skillFile);
						if (!instruction) {
							throw new Error(`Failed to load skill '${skillName}'`);
						}

						return [
							`<skill name="${skill.frontmatter.name}" location="${skill.skillFile}">`,
							`References are relative to ${skill.skillDir}.`,
							"",
							instruction,
							"</skill>",
						].join("\n");
					},
					parameters: z.object({
						name: z.string().min(1).describe("Skill name to load"),
					}),
				}),
			},
		];

		const featureToolsOrErr = await this.#buildFeatureAITools(authContext);
		if (featureToolsOrErr.isLeft()) {
			throw featureToolsOrErr.value;
		}

		const tools = [...builtInTools, ...featureToolsOrErr.value];
		this.#assertUniqueToolAliases(tools);
		return tools;
	}

	async #buildFeatureAITools(
		authContext: AuthenticationContext,
	): Promise<
		Either<AntboxError, Array<{ tool: FunctionTool; name: string; allowlistNames: string[] }>>
	> {
		const aiToolsOrErr = await this.#featuresService.listAITools(authContext);
		if (aiToolsOrErr.isLeft()) {
			return left(aiToolsOrErr.value);
		}

		return right(
			aiToolsOrErr.value.map((feature) => this.#featureToFunctionTool(authContext, feature)),
		);
	}

	#featureToFunctionTool(
		authContext: AuthenticationContext,
		feature: FeatureData,
	): { tool: FunctionTool; name: string; allowlistNames: string[] } {
		const toolName = toSnakeCase(feature.uuid);
		const parameterAliases = this.#featureParameterAliases(feature.parameters);
		return {
			name: toolName,
			allowlistNames: [toolName, feature.uuid],
			tool: new FunctionTool({
				name: toolName,
				description: feature.description,
				execute: async (params: Record<string, unknown>) => {
					if (!this.#featureAIToolExecutor) {
						throw new Error("Feature AI tool executor not available");
					}

					const mappedParams = this.#mapFeatureParameters(parameterAliases, params);
					const resultOrErr = await this.#featureAIToolExecutor.runAITool(
						authContext,
						feature.uuid,
						mappedParams,
					);
					if (resultOrErr.isLeft()) {
						throw new Error(resultOrErr.value.message);
					}

					return normalizeToolResult(resultOrErr.value);
				},
				parameters: this.#featureParametersToSchema(parameterAliases),
			}),
		};
	}

	#featureParameterAliases(parameters: FeatureParameter[]) {
		const aliasEntries = parameters.map((parameter) => ({
			parameter,
			exposedName: toSnakeCase(parameter.name),
		}));
		const seenNames = new Set<string>();
		for (const entry of aliasEntries) {
			if (seenNames.has(entry.exposedName)) {
				throw new Error(
					`Feature parameter alias collision for '${entry.exposedName}' on parameter '${entry.parameter.name}'`,
				);
			}
			seenNames.add(entry.exposedName);
		}
		return aliasEntries;
	}

	#mapFeatureParameters(
		aliases: Array<{ parameter: FeatureParameter; exposedName: string }>,
		params: Record<string, unknown>,
	): Record<string, unknown> {
		const mapped: Record<string, unknown> = {};
		for (const alias of aliases) {
			if (alias.exposedName in params) {
				mapped[alias.parameter.name] = params[alias.exposedName];
			}
		}
		return mapped;
	}

	#featureParametersToSchema(
		aliases: Array<{ parameter: FeatureParameter; exposedName: string }>,
	) {
		const shape: Record<string, z.ZodTypeAny> = {};

		for (const { parameter, exposedName } of aliases) {
			const description = parameter.description ?? parameter.name;
			let schema: z.ZodTypeAny;

			switch (parameter.type) {
				case "string":
					schema = z.string();
					break;
				case "date":
					schema = z.string().describe(`${description} (ISO-8601 date string)`);
					break;
				case "number":
					schema = z.number();
					break;
				case "boolean":
					schema = z.boolean();
					break;
				case "object":
					schema = z.record(z.string(), z.unknown());
					break;
				case "file":
					schema = z.instanceof(File);
					break;
				case "array":
					schema = z.array(this.#featureArrayItemSchema(parameter.arrayType));
					break;
			}

			if (parameter.required) {
				shape[exposedName] = schema.describe(description);
			} else {
				shape[exposedName] = schema.optional().describe(description);
			}
		}

		return z.object(shape);
	}

	#featureArrayItemSchema(arrayType: FeatureParameter["arrayType"]): z.ZodTypeAny {
		switch (arrayType) {
			case "number":
				return z.number();
			case "file":
				return z.instanceof(File);
			case "object":
				return z.record(z.string(), z.unknown());
			case "string":
			case undefined:
				return z.string();
		}
	}

	// ========================================================================
	// PRIVATE: HELPERS
	// ========================================================================

	#assertUniqueToolAliases(tools: Array<{ name: string }>): void {
		const seenNames = new Set<string>();
		for (const tool of tools) {
			if (seenNames.has(tool.name)) {
				throw new Error(`Duplicate AI tool name '${tool.name}'`);
			}
			seenNames.add(tool.name);
		}
	}

	#formatAvailableSkills(): string {
		const visibleSkills = this.#skills;
		if (visibleSkills.length === 0) {
			return "";
		}

		const lines = [
			"The following skills provide specialized instructions for specific tasks.",
			"Use the load_skill tool to load a skill when the task matches its description.",
			"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md).",
			"",
			"<available_skills>",
		];

		for (const skill of visibleSkills) {
			lines.push("  <skill>");
			lines.push(`    <name>${skill.frontmatter.name}</name>`);
			lines.push(`    <description>${skill.frontmatter.description}</description>`);
			lines.push(`    <location>${skill.skillFile}</location>`);
			lines.push("  </skill>");
		}

		lines.push("</available_skills>");
		return lines.join("\n");
	}

	async #runAndCollect(
		runner: InMemoryRunner,
		params: {
			userId: string;
			sessionId?: string;
			newMessage: { role: string; parts: { text: string }[] };
		},
		runConfig?: RunConfig,
		debugLogger?: Logger,
	): Promise<{ text: string; usage?: TokenUsage; messages: ChatMessage[] }> {
		let finalText = "";
		let usage: TokenUsage | undefined;
		const messages: ChatMessage[] = [];

		const runParams = params.sessionId
			? {
				userId: params.userId,
				sessionId: params.sessionId,
				newMessage: params.newMessage,
				runConfig,
			}
			: {
				userId: params.userId,
				newMessage: params.newMessage,
				runConfig,
			};

		const generator = params.sessionId
			? runner.runAsync(runParams as Parameters<typeof runner.runAsync>[0])
			: runner.runEphemeral(runParams as Parameters<typeof runner.runEphemeral>[0]);

		for await (const event of generator) {
			if (debugLogger && shouldTraceAgentDebugEvent(event)) {
				debugLogger.debug(
					"agent_debug_trace_event",
					JSON.stringify(summarizeAgentDebugEvent(event)),
				);
			}
			messages.push(...eventToChatMessages(event, { includeText: isFinalResponse(event) }));
			if (isFinalResponse(event)) {
				const text = stringifyContent(event).trim();
				if (text.length > 0) {
					finalText = text;
				}
				usage = usageMetadataToTokenUsage(event.usageMetadata) ?? usage;
			}
		}

		if (debugLogger) {
			debugLogger.debug(
				"agent_debug_trace_end",
				JSON.stringify({
					type: "agent_run_end",
					finalTextLength: finalText.length,
					finalTextPreview: truncateDebugText(finalText, 300),
					messageCount: messages.length,
					usage,
				}),
			);
		}

		return { text: finalText, usage, messages };
	}

	#buildInstruction(agentData: AgentData, additionalInstructions?: string): string {
		let instruction = resolveAgentSystemPrompt(agentData.systemPrompt);
		const skillsPrompt = this.#formatAvailableSkills();
		if (skillsPrompt.length > 0) {
			instruction += `\n\n${skillsPrompt}`;
		}
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
