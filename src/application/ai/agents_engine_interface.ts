import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { ChatHistory, ChatMessage, TokenUsage } from "domain/ai/chat_message.ts";

export interface ChatOptions {
	readonly history?: ChatHistory;
	readonly files?: File[];
	readonly temperature?: number;
	readonly maxTokens?: number;
	readonly instructions?: string;
	/** When provided, reuses the sealed tool snapshot opened via openChatSession. */
	readonly sessionId?: string;
}

export interface AnswerOptions {
	readonly files?: File[];
	readonly temperature?: number;
	readonly maxTokens?: number;
	readonly instructions?: string;
	readonly sessionId?: string;
}

export interface ChatSessionHandle {
	readonly sessionId: string;
	readonly toolNames: readonly string[];
	readonly expiresAt: number;
}

export interface FeatureAIToolExecutor {
	runAITool<T>(
		authContext: AuthenticationContext,
		uuid: string,
		parameters: Record<string, unknown>,
	): Promise<Either<AntboxError, T>>;
}

export interface IAgentsEngine {
	chat(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: ChatOptions,
	): Promise<Either<AntboxError, ChatHistory>>;

	answer(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: AnswerOptions,
	): Promise<Either<AntboxError, ChatMessage>>;

	listAvailableToolNames(
		authContext: AuthenticationContext,
		agentData: AgentData,
	): Promise<Either<AntboxError, string[]>>;

	setFeatureAIToolExecutor(executor: FeatureAIToolExecutor): void;

	/**
	 * Open a sealed chat session: builds the tool snapshot once and caches it
	 * for subsequent chat/answer calls that pass the returned sessionId.
	 * Subsequent turns within the same session use the cached tool set even if
	 * features are added/removed or the agent definition is updated mid-conversation.
	 */
	openChatSession(
		authContext: AuthenticationContext,
		agentUuid: string,
	): Promise<Either<AntboxError, ChatSessionHandle>>;

	closeChatSession(sessionId: string): boolean;
}

/**
 * Internal-only API. Handlers in `src/api/` MUST NOT receive this type — the
 * `runInternal*` methods bypass the `exposedToUsers` guard and are intended for
 * trusted code (e.g. agents invoking other agents, FeaturesEngine).
 */
export interface IAgentsEngineInternal extends IAgentsEngine {
	runInternalChat(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: ChatOptions,
	): Promise<Either<AntboxError, ChatHistory>>;

	runInternalAnswer(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: AnswerOptions,
	): Promise<Either<AntboxError, ChatMessage>>;
}

export type { TokenUsage };
