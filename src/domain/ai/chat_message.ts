export type ChatMessageRole = "user" | "model" | "tool";

export interface ToolCall {
	name: string;
	args: Record<string, unknown>;
}

export interface ToolResponse {
	name: string;
	text: string;
}

export interface ChatMessage {
	role: ChatMessageRole;
	parts: Array<ChatMessagePart>;
}

export interface ChatMessagePart {
	text?: string;
	toolCall?: ToolCall;
	toolResponse?: ToolResponse;
}

export type ChatHistory = ChatMessage[];
