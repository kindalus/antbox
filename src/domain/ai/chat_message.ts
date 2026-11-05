export type ChatMessageRole = "user" | "model" | "tool";

export interface ToolCall {
	id?: string;
	name: string;
	args: Record<string, unknown>;
}

export interface ToolResponse {
	id?: string;
	name: string;
	text: string;
}

export interface TokenUsage {
	/** Includes cache reads and writes. */
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
}

export interface ChatMessage {
	role: ChatMessageRole;
	parts: Array<ChatMessagePart>;
	usage?: TokenUsage;
}

export interface ChatMessagePart {
	text?: string;
	toolCall?: ToolCall;
	toolResponse?: ToolResponse;
}

export type ChatHistory = ChatMessage[];
