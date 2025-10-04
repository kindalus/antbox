/**
 * Chat message DTO for API communication
 */
export interface ChatMessageDTO {
	readonly role: "user" | "model" | "tool";
	readonly text?: string;
	readonly toolCall?: {
		readonly name: string;
		readonly args: Record<string, unknown>;
	};
}
