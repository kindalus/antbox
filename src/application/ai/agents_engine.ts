import {
	Agent,
	type AgentEvent,
	type AgentMessage,
	type AgentTool,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";
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
import {
	type AgentModelRuntime,
	createModelRuntime,
	type ResolveModelOptions,
} from "./resolve_model.ts";
import { buildToolSet } from "./build_tools.ts";
import {
	chatHistoryToPiMessages,
	piMessagesToChatMessages,
	piMessagesUsage,
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
import { setTelemetryAttributes, withTelemetrySpan } from "shared/telemetry.ts";
import type { Span } from "@opentelemetry/api";

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
	readonly modelRuntime?: AgentModelRuntime;
	readonly sessionStore?: SessionStore;
	readonly now?: () => Date;
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

function setTelemetryUsageAttributes(span: Span, usage?: TokenUsage): void {
	setTelemetryAttributes(span, {
		"gen_ai.usage.input_tokens": usage?.promptTokens,
		"gen_ai.usage.output_tokens": usage?.completionTokens,
		"gen_ai.usage.total_tokens": usage?.totalTokens,
	});
}

function lastAssistant(messages: readonly AgentMessage[]): AssistantMessage | undefined {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index] as Message;
		if (message.role === "assistant") return message;
	}
	return undefined;
}

function assistantText(message: AssistantMessage | undefined): string {
	return message?.content
		.filter((content) => content.type === "text")
		.map((content) => content.text)
		.join("") ?? "";
}

function summarizeAgentEvent(event: AgentEvent): Record<string, unknown> {
	switch (event.type) {
		case "turn_end": {
			const message = event.message as Message;
			return {
				piEvent: event.type,
				stopReason: message.role === "assistant" ? message.stopReason : undefined,
				toolResultCount: event.toolResults.length,
			};
		}
		case "tool_execution_start":
			return { piEvent: event.type, toolName: event.toolName };
		case "tool_execution_end":
			return { piEvent: event.type, toolName: event.toolName, isError: event.isError };
		case "agent_end":
			return { piEvent: event.type, messageCount: event.messages.length };
		default:
			return { piEvent: event.type };
	}
}

function ensureTerminalModelMessage(result: AgentRunOutput): AgentRunOutput {
	if (result.messages.at(-1)?.role === "model") return result;
	const text = result.text.trim() || FALLBACK_FINAL_ANSWER;
	return {
		...result,
		text,
		messages: [...result.messages, { role: "model", parts: [{ text }] }],
	};
}

function formatLocalIsoDate(date: Date): string {
	const year = String(date.getFullYear()).padStart(4, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatTodayInstruction(date = new Date()): string {
	const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
	return `Today's date: ${formatLocalIsoDate(date)} (${weekday}).`;
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/**
 * AgentsEngine — Pi-based agent execution engine.
 *
 * Stateless: each call resolves an AgentData snapshot, builds tools, replays history,
 * and creates an ephemeral Pi Agent for multi-turn tool use.
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
	readonly #modelRuntime: AgentModelRuntime;
	readonly #sessionStore: SessionStore;
	readonly #now: () => Date;
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
		this.#modelRuntime = ctx.modelRuntime ?? createModelRuntime(ctx.modelOptions);
		this.#sessionStore = ctx.sessionStore ?? new SessionStore();
		this.#now = ctx.now ?? (() => new Date());
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
			temperature: options?.temperature,
			maxTokens: options?.maxTokens,
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
			temperature: options?.temperature,
			maxTokens: options?.maxTokens,
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
			temperature?: number;
			maxTokens?: number;
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
			if (
				session.tenant !== authContext.tenant ||
				session.agentUuid !== agentUuid ||
				session.userEmail !== authContext.principal.email
			) {
				return left(
					new AntboxError(
						"InvalidSession",
						`Session '${options.sessionId}' does not match tenant/agent/user`,
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
			const modelString = this.#resolveModelString(agentData);
			const model = this.#modelRuntime.resolveModel(modelString);
			const historyMessages = chatHistoryToPiMessages(history, model);
			const customAgent = getCustomAgent(agentUuid);
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
				result = await created.run({
					messages: [
						...historyMessages,
						{ role: "user", content: text, timestamp: Date.now() },
					],
					userText: text,
					additionalInstructions: options.instructions,
				});
			} else {
				result = await this.#runLlmAgent(
					agentData,
					authContext,
					modelString,
					model,
					historyMessages,
					options.instructions,
					options.interactionType,
					text,
					options.temperature,
					options.maxTokens,
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
		modelString: string,
		model: Model<Api>,
		historyMessages: Message[],
		additionalInstructions: string | undefined,
		interactionType: "chat" | "answer",
		userText: string,
		temperature?: number,
		maxTokens?: number,
		debugLogger?: Logger,
		session?: SessionSnapshot,
	): Promise<AgentRunOutput> {
		let tools: AgentTool[];
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

		if (!await this.#modelRuntime.isConfigured(model.provider)) {
			throw new AntboxError(
				"MissingProviderApiKey",
				`Provider '${model.provider}' is not configured`,
			);
		}

		const instruction = this.#buildInstruction(agentData, toolNames, additionalInstructions);
		debugLogger?.debug(
			"agent_debug_trace_start",
			JSON.stringify({
				type: "agent_run_start",
				agentUuid: agentData.uuid,
				agentName: agentData.name,
				model: modelString,
				interactionType,
				toolNames,
				instructionLength: instruction.length,
			}),
		);

		let llmCalls = 0;
		const streamFn = this.#streamWithOptions(temperature, maxTokens);
		const agent = new Agent({
			streamFn,
			getApiKey: (provider) => this.#modelRuntime.getApiKey(provider),
			shouldStopAfterTurn: () =>
				++llmCalls >=
					(agentData.maxLlmCalls ?? DEFAULT_MAX_LLM_CALLS),
			initialState: {
				systemPrompt: instruction,
				model,
				thinkingLevel: "off",
				tools,
				messages: historyMessages,
			},
		});
		this.#subscribeDebugTrace(agent, debugLogger, "agent_run_event");

		const initialMessageCount = historyMessages.length;
		const generated = await withTelemetrySpan(
			"antbox.ai.generate_text",
			{
				"antbox.tenant": authContext.tenant,
				"antbox.agent.uuid": agentData.uuid,
				"antbox.ai.interaction_type": interactionType,
				"gen_ai.operation.name": "agent_run",
				"gen_ai.request.model": modelString,
			},
			async (span) => {
				await agent.prompt(userText);
				this.#assertAgentSucceeded(agent);
				const newMessages = agent.state.messages.slice(initialMessageCount + 1) as Message[];
				setTelemetryUsageAttributes(span, piMessagesUsage(newMessages));
				return newMessages;
			},
		);

		let usage = piMessagesUsage(generated);
		const outputMessages = piMessagesToChatMessages(generated);
		let finalText = assistantText(lastAssistant(generated));

		if (endsWithToolMessage(outputMessages)) {
			const synthesized = await this.#synthesizeFinalAnswer(
				authContext,
				agentData,
				interactionType,
				modelString,
				model,
				instruction,
				agent.state.messages,
				streamFn,
				debugLogger,
			);
			finalText = synthesized.text;
			usage = combineUsage(usage, synthesized.usage);
			outputMessages.push({ role: "model", parts: [{ text: finalText }] });
		}

		debugLogger?.debug(
			"agent_debug_trace_end",
			JSON.stringify({
				type: "agent_run_end",
				llmCalls,
				finalTextLength: finalText.length,
				messageCount: outputMessages.length,
				usage,
			}),
		);
		return { text: finalText, usage, messages: outputMessages };
	}

	async #synthesizeFinalAnswer(
		authContext: AuthenticationContext,
		agentData: AgentData,
		interactionType: "chat" | "answer",
		modelString: string,
		model: Model<Api>,
		instruction: string,
		messages: AgentMessage[],
		streamFn: StreamFn,
		debugLogger?: Logger,
	): Promise<{ text: string; usage?: TokenUsage }> {
		debugLogger?.debug(
			"agent_debug_trace_event",
			JSON.stringify({ type: "agent_final_answer_synthesis_start" }),
		);
		const agent = new Agent({
			streamFn,
			getApiKey: (provider) => this.#modelRuntime.getApiKey(provider),
			initialState: {
				systemPrompt: instruction,
				model,
				thinkingLevel: "off",
				tools: [],
				messages,
			},
		});
		this.#subscribeDebugTrace(agent, debugLogger, "agent_final_answer_synthesis_event");
		const initialMessageCount = messages.length;
		const generated = await withTelemetrySpan(
			"antbox.ai.generate_text",
			{
				"antbox.tenant": authContext.tenant,
				"antbox.agent.uuid": agentData.uuid,
				"antbox.ai.interaction_type": interactionType,
				"gen_ai.operation.name": "agent_final_answer_synthesis",
				"gen_ai.request.model": modelString,
			},
			async (span) => {
				await agent.prompt(FINAL_ANSWER_INSTRUCTION);
				this.#assertAgentSucceeded(agent);
				const newMessages = agent.state.messages.slice(initialMessageCount + 1) as Message[];
				setTelemetryUsageAttributes(span, piMessagesUsage(newMessages));
				return newMessages;
			},
		);
		const text = assistantText(lastAssistant(generated)).trim() || FALLBACK_FINAL_ANSWER;
		const usage = piMessagesUsage(generated);
		debugLogger?.debug(
			"agent_debug_trace_event",
			JSON.stringify({
				type: "agent_final_answer_synthesis_end",
				textLength: text.length,
				usage,
			}),
		);
		return { text, usage };
	}

	#streamWithOptions(temperature?: number, maxTokens?: number): StreamFn {
		return (model, context, options) =>
			this.#modelRuntime.streamFn(model, context, {
				...options,
				temperature: temperature ?? options?.temperature,
				maxTokens: maxTokens ?? options?.maxTokens,
			});
	}

	#assertAgentSucceeded(agent: Agent): void {
		if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
		const final = lastAssistant(agent.state.messages);
		if (final?.stopReason === "error" || final?.stopReason === "aborted") {
			throw new Error(final.errorMessage ?? `Provider stopped with '${final.stopReason}'`);
		}
	}

	#subscribeDebugTrace(agent: Agent, logger: Logger | undefined, eventType: string): void {
		if (!logger) return;
		agent.subscribe((event) => {
			logger.debug(
				"agent_debug_trace_event",
				JSON.stringify({ type: eventType, ...summarizeAgentEvent(event) }),
			);
		});
	}

	#resolveModelString(agentData: AgentData): string {
		return !agentData.model || agentData.model === "default"
			? this.#defaultModel
			: agentData.model;
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

		instruction += `\n\n${formatTodayInstruction(this.#now())}`;

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
			lines.push(`    <name>${escapeXml(skill.frontmatter.name)}</name>`);
			lines.push(`    <description>${escapeXml(skill.frontmatter.description)}</description>`);
			lines.push(`    <location>${escapeXml(skill.skillFile)}</location>`);
			lines.push("  </skill>");
		}

		lines.push("</available_skills>");
		return lines.join("\n");
	}
}
