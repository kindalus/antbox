import type { AgentMessage, AgentTool } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Message, Model } from "@earendil-works/pi-ai";
import { type Either, left, right } from "shared/either.ts";
import { AntboxError, ForbiddenError } from "shared/antbox_error.ts";
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
import type { AgentModelRuntime } from "./resolve_model.ts";
import type { AgentSessionRunner } from "./pi_agent_session.ts";
import { buildToolSet, type BuiltToolSet } from "./build_tools.ts";
import {
	chatHistoryToPiMessages,
	piMessagesToChatMessages,
	piMessagesUsage,
	validateChatHistory,
} from "./messages.ts";
import type {
	AnswerOptions,
	ChatOptions,
	ChatSessionResult,
	FeatureAIToolExecutor,
	IAgentsEngineInternal,
} from "./agents_engine_interface.ts";
import { type SessionManifest, SessionWorkspaceStore } from "./session_workspace.ts";
import { setTelemetryAttributes, withTelemetrySpan } from "shared/telemetry.ts";
import type { Span } from "@opentelemetry/api";
import {
	modelName,
	type ModelSelection,
	type ThinkingLevel,
	thinkingLevel,
} from "domain/ai/model_selection.ts";

const AGENT_DEBUG_TRACE_ENV = "ANTBOX_AGENT_DEBUG_TRACE";
const FALLBACK_FINAL_ANSWER = "Pi session ended without a final model answer.";

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
	readonly defaultModel: ModelSelection;
	readonly skills: LoadedSkill[];
	readonly eventBus: EventBus;
	readonly tenantLimitsGuard?: TenantLimitsEnforcer;
	readonly modelRuntime: AgentModelRuntime;
	readonly sessionRunner: AgentSessionRunner;
	readonly sessionWorkspace?: SessionWorkspaceStore;
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

/**
 * AgentsEngine — Pi-based agent execution engine.
 *
 * One-shot calls use in-memory Pi AgentSessions. Persisted calls use tenant-scoped JSONL
 * sessions with fixed agent, tool, and skill snapshots.
 */
export class AgentsEngine implements IAgentsEngineInternal {
	readonly #agentsService: AgentsService;
	readonly #featuresService: FeaturesService;
	readonly #nodeService: NodeService;
	readonly #aspectsService: AspectsService;
	readonly #defaultModel: ModelSelection;
	readonly #skills: LoadedSkill[];
	readonly #ragService?: RAGService;
	readonly #eventBus: EventBus;
	readonly #tenantLimitsGuard?: TenantLimitsEnforcer;
	readonly #modelRuntime: AgentModelRuntime;
	readonly #sessionRunner: AgentSessionRunner;
	readonly #sessionWorkspace?: SessionWorkspaceStore;
	readonly #now: () => Date;
	readonly #sessionLocks = new Map<string, Promise<void>>();
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
		this.#modelRuntime = ctx.modelRuntime;
		this.#sessionRunner = ctx.sessionRunner;
		this.#sessionWorkspace = ctx.sessionWorkspace;
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

	async createChatSession(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
	): Promise<Either<AntboxError, ChatSessionResult>> {
		if (!this.#sessionWorkspace) {
			return left(
				new AntboxError("SessionsUnavailable", "Persisted sessions are not configured"),
			);
		}
		const agentOrErr = await this.#agentsService.getAgent(authContext, agentUuid);
		if (agentOrErr.isLeft()) return left(agentOrErr.value);
		const agentData = agentOrErr.value;
		if (agentData.exposedToUsers === false) {
			return left(new ForbiddenError(`Agent ${agentData.name} is not available`));
		}
		if (getCustomAgent(agentUuid)) {
			return left(
				new AntboxError(
					"PersistentSessionUnsupported",
					"Custom agents do not support persisted sessions",
				),
			);
		}
		const limitsOrErr = await this.#tenantLimitsGuard?.ensureCanRunAgent() ?? right(undefined);
		if (limitsOrErr.isLeft()) return left(limitsOrErr.value);
		const builtOrErr = await this.#buildTools(agentData, authContext);
		if (builtOrErr.isLeft()) return left(builtOrErr.value);
		const skills = this.#selectSkills(agentData.skills);
		let sessionId: string | undefined;
		try {
			await this.#sessionWorkspace.sweepExpired();
			const workspace = await this.#sessionWorkspace.create({
				tenant: authContext.tenant,
				userEmail: authContext.principal.email,
				agentData,
				toolNames: builtOrErr.value.toolNames,
				featureVersions: builtOrErr.value.featureVersions,
				skills,
			});
			sessionId = workspace.manifest.sessionId;
			const snapshotToolsOrErr = await this.#buildTools(
				agentData,
				authContext,
				workspace.manifest.toolNames,
				workspace.skills,
			);
			if (snapshotToolsOrErr.isLeft()) throw snapshotToolsOrErr.value;
			const manager = await this.#sessionRunner.createPersistentManager(
				workspace.dir,
				workspace.dir,
				sessionId,
				workspace.manifest,
			);
			return right(
				await this.#runPersistedSession(
					authContext,
					workspace.manifest,
					workspace.skills,
					snapshotToolsOrErr.value.tools,
					manager,
					text,
				),
			);
		} catch (error) {
			if (sessionId) await this.#sessionWorkspace.rollback(sessionId);
			return left(this.#sessionError(error));
		}
	}

	async continueChatSession(
		authContext: AuthenticationContext,
		agentUuid: string,
		sessionId: string,
		text: string,
	): Promise<Either<AntboxError, ChatSessionResult>> {
		if (!this.#sessionWorkspace) {
			return left(
				new AntboxError("SessionsUnavailable", "Persisted sessions are not configured"),
			);
		}
		const limitsOrErr = await this.#tenantLimitsGuard?.ensureCanRunAgent() ?? right(undefined);
		if (limitsOrErr.isLeft()) return left(limitsOrErr.value);
		return await this.#withSessionLock(sessionId, async () => {
			try {
				const workspace = await this.#sessionWorkspace!.open(sessionId, {
					tenant: authContext.tenant,
					userEmail: authContext.principal.email,
					agentUuid,
				});
				const builtOrErr = await this.#buildTools(
					workspace.manifest.agentData,
					authContext,
					workspace.manifest.toolNames,
					workspace.skills,
				);
				if (builtOrErr.isLeft()) return left(builtOrErr.value);
				this.#assertFeatureVersions(
					workspace.manifest.featureVersions,
					builtOrErr.value.featureVersions,
				);
				const manager = await this.#sessionRunner.openPersistentManager(
					this.#sessionWorkspace!.findSessionFile(workspace),
				);
				return right(
					await this.#runPersistedSession(
						authContext,
						workspace.manifest,
						workspace.skills,
						builtOrErr.value.tools,
						manager,
						text,
					),
				);
			} catch (error) {
				return left(this.#sessionError(error));
			}
		});
	}

	async deleteChatSession(
		authContext: AuthenticationContext,
		agentUuid: string,
		sessionId: string,
	): Promise<Either<AntboxError, void>> {
		if (!this.#sessionWorkspace) {
			return left(
				new AntboxError("SessionsUnavailable", "Persisted sessions are not configured"),
			);
		}
		return await this.#withSessionLock(sessionId, async () => {
			try {
				await this.#sessionWorkspace!.delete(sessionId, {
					tenant: authContext.tenant,
					userEmail: authContext.principal.email,
					agentUuid,
				});
				return right(undefined);
			} catch (error) {
				if ((error as Error).message === "Session not found") return right(undefined);
				return left(this.#sessionError(error));
			}
		});
	}

	async #withSessionLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
		const previous = this.#sessionLocks.get(sessionId) ?? Promise.resolve();
		let release = () => {};
		const turn = new Promise<void>((resolve) => {
			release = resolve;
		});
		const queued = previous.then(() => turn);
		this.#sessionLocks.set(sessionId, queued);
		await previous;
		try {
			return await operation();
		} finally {
			release();
			if (this.#sessionLocks.get(sessionId) === queued) this.#sessionLocks.delete(sessionId);
		}
	}

	async #buildTools(
		agentData: AgentData,
		authContext: AuthenticationContext,
		sealedToolNames?: readonly string[],
		skills: readonly LoadedSkill[] = this.#skills,
	): Promise<Either<AntboxError, BuiltToolSet>> {
		return await buildToolSet(
			{
				nodeService: this.#nodeService,
				aspectsService: this.#aspectsService,
				featuresService: this.#featuresService,
				ragService: this.#ragService,
				skills: [...skills],
				featureAIToolExecutor: this.#featureAIToolExecutor,
			},
			agentData,
			authContext,
			sealedToolNames,
		);
	}

	async #runPersistedSession(
		authContext: AuthenticationContext,
		manifest: SessionManifest,
		skills: readonly LoadedSkill[],
		tools: readonly AgentTool[],
		sessionManager: Awaited<ReturnType<AgentSessionRunner["createInMemoryManager"]>>,
		text: string,
	): Promise<ChatSessionResult> {
		const selection = this.#resolveModelSelection(manifest.agentData);
		const modelString = modelName(selection);
		const model = this.#modelRuntime.resolveModel(modelString);
		if (!await this.#modelRuntime.isConfigured(model.provider)) {
			throw new AntboxError(
				"MissingProviderApiKey",
				`Provider '${model.provider}' is not configured`,
			);
		}
		const instruction = this.#buildInstruction(manifest.agentData);
		const generated = await withTelemetrySpan(
			"antbox.ai.generate_text",
			{
				"antbox.tenant": authContext.tenant,
				"antbox.agent.uuid": manifest.agentUuid,
				"antbox.ai.interaction_type": "chat_session",
				"gen_ai.operation.name": "agent_run",
				"gen_ai.request.model": modelString,
			},
			async (span) => {
				const output = await this.#sessionRunner.run({
					cwd: this.#sessionWorkspace?.root ?? Deno.cwd(),
					model,
					thinkingLevel: thinkingLevel(selection),
					systemPrompt: instruction,
					tools,
					skills,
					sessionManager,
					userText: text,
				});
				setTelemetryUsageAttributes(span, piMessagesUsage(output.messages));
				return output.messages;
			},
		);
		const usage = piMessagesUsage(generated);
		const messages = piMessagesToChatMessages(generated);
		const final = messages.findLast((message) => message.role === "model");
		if (!final) throw new AntboxError("IncompleteAgentRun", FALLBACK_FINAL_ANSWER);
		const message = { ...final, usage: usage ?? final.usage };
		if (usage) {
			this.#eventBus.publish(
				new AgentInteractionCompletedEvent(
					authContext.principal.email,
					authContext.tenant,
					{
						agentUuid: manifest.agentUuid,
						usage,
						interactionType: "chat",
					},
				),
			);
		}
		return {
			sessionId: manifest.sessionId,
			expiresAt: manifest.expiresAt,
			message,
		};
	}

	#assertFeatureVersions(
		expected: readonly { uuid: string; modifiedTime: string }[],
		actual: readonly { uuid: string; modifiedTime: string }[],
	): void {
		const canonical = (values: readonly { uuid: string; modifiedTime: string }[]) =>
			JSON.stringify([...values].sort((left, right) => left.uuid.localeCompare(right.uuid)));
		if (canonical(expected) !== canonical(actual)) {
			throw new AntboxError("StaleSession", "A feature tool changed during the session");
		}
	}

	#sessionError(error: unknown): AntboxError {
		if (error instanceof AntboxError) return error;
		const message = error instanceof Error ? error.message : String(error);
		if (message === "Session expired") {
			return new AntboxError("SessionExpired", "Session expired");
		}
		if (message === "Session not found" || message === "Invalid session ID") {
			return new AntboxError("InvalidSession", "Session not found");
		}
		return new AntboxError("AgentChatError", `Session failed: ${message}`);
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
			interactionType: "chat" | "answer";
			internal: boolean;
		},
	): Promise<Either<AntboxError, AgentRunOutput>> {
		const agentOrErr = await this.#agentsService.getAgent(authContext, agentUuid);
		if (agentOrErr.isLeft()) return left(agentOrErr.value);
		const agentData = agentOrErr.value;

		if (!options.internal && agentData.exposedToUsers === false) {
			return left(
				new ForbiddenError(
					`Agent ${agentData.name} is not available for direct ${options.interactionType}`,
				),
			);
		}

		const limitsOrErr = await this.#tenantLimitsGuard?.ensureCanRunAgent() ?? right(undefined);
		if (limitsOrErr.isLeft()) return left(limitsOrErr.value);

		const history = options.history ?? [];
		const validation = validateChatHistory(history);
		if (validation.isLeft()) return left(validation.value);

		const debugLogger = isAgentDebugTraceEnabled()
			? Logger.instance(
				"AgentsEngine",
				`tenant=${authContext.tenant}`,
				`agent=${agentData.uuid}`,
			)
			: undefined;

		try {
			const modelSelection = this.#resolveModelSelection(agentData);
			const modelString = modelName(modelSelection);
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
					defaultModel: modelName(this.#defaultModel),
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
					thinkingLevel(modelSelection),
					historyMessages,
					options.instructions,
					options.interactionType,
					text,
					debugLogger,
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
		modelThinkingLevel: ThinkingLevel,
		historyMessages: Message[],
		additionalInstructions: string | undefined,
		interactionType: "chat" | "answer",
		userText: string,
		debugLogger?: Logger,
	): Promise<AgentRunOutput> {
		const builtOrErr = await this.#buildTools(agentData, authContext);
		if (builtOrErr.isLeft()) throw builtOrErr.value;
		const tools = builtOrErr.value.tools;
		const toolNames = builtOrErr.value.toolNames;

		if (!await this.#modelRuntime.isConfigured(model.provider)) {
			throw new AntboxError(
				"MissingProviderApiKey",
				`Provider '${model.provider}' is not configured`,
			);
		}

		const instruction = this.#buildInstruction(agentData, additionalInstructions);
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

		const manager = await this.#sessionRunner.createInMemoryManager(Deno.cwd());
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
				const output = await this.#sessionRunner.run({
					cwd: Deno.cwd(),
					model,
					thinkingLevel: modelThinkingLevel,
					systemPrompt: instruction,
					tools,
					skills: this.#selectSkills(agentData.skills),
					sessionManager: manager,
					initialMessages: historyMessages,
					userText,
				});
				setTelemetryUsageAttributes(span, piMessagesUsage(output.messages));
				return output.messages;
			},
		);

		const usage = piMessagesUsage(generated);
		const outputMessages = piMessagesToChatMessages(generated);
		const finalText = assistantText(lastAssistant(generated)).trim();
		if (!finalText) throw new AntboxError("IncompleteAgentRun", FALLBACK_FINAL_ANSWER);

		debugLogger?.debug(
			"agent_debug_trace_end",
			JSON.stringify({
				type: "agent_run_end",
				finalTextLength: finalText.length,
				messageCount: outputMessages.length,
				usage,
			}),
		);
		return { text: finalText, usage, messages: outputMessages };
	}

	#resolveModelSelection(agentData: AgentData): ModelSelection {
		return !agentData.model || modelName(agentData.model) === "default"
			? this.#defaultModel
			: agentData.model;
	}

	#buildInstruction(
		agentData: AgentData,
		additionalInstructions?: string,
	): string {
		let instruction = resolveAgentSystemPrompt(agentData.systemPrompt);

		if (additionalInstructions) {
			instruction += `\n\n**INSTRUCTIONS**\n\n${additionalInstructions}`;
		}

		instruction += `\n\n${formatTodayInstruction(this.#now())}`;

		return instruction;
	}

	#selectSkills(allowList?: string[]): LoadedSkill[] {
		const allow = allowList && allowList.length > 0 ? new Set(allowList) : undefined;
		return allow
			? this.#skills.filter((skill) => allow.has(skill.frontmatter.name))
			: [...this.#skills];
	}
}
