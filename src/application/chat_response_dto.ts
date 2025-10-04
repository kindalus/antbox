import { ChatMessageDTO } from "./chat_message_dto.ts";

/**
 * Response DTO for agent chat execution
 */
export interface ChatResponseDTO {
	readonly response: string; // Markdown formatted response
	readonly history: ChatMessageDTO[]; // Complete updated history
}
