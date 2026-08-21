import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { ChatHistory, ChatMessage, TokenUsage } from "domain/ai/chat_message.ts";

export interface ChatOptions {
	readonly history?: ChatHistory;
	readonly files?: File[];
	readonly instructions?: string;
}

export interface AnswerOptions {
	readonly files?: File[];
	readonly instructions?: string;
}

export interface ChatSessionResult {
	readonly sessionId: string;
	readonly expiresAt: number;
	readonly message: ChatMessage;
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

	createChatSession(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
	): Promise<Either<AntboxError, ChatSessionResult>>;

	continueChatSession(
		authContext: AuthenticationContext,
		agentUuid: string,
		sessionId: string,
		text: string,
	): Promise<Either<AntboxError, ChatSessionResult>>;

	deleteChatSession(
		authContext: AuthenticationContext,
		agentUuid: string,
		sessionId: string,
	): Promise<Either<AntboxError, void>>;
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
