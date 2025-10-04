import { Either } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { ChatHistory, ChatMessage } from "domain/ai/chat_message.ts";
import { FeatureDTO } from "application/feature_dto.ts";

/**
 * Represents a vector embedding - an array of numbers representing
 * the semantic meaning of text in high-dimensional space
 */
export type Embedding = number[];

/**
 * Interface for AI model providers
 * Implementations can use various AI services (OpenAI, Anthropic, local models, etc.)
 */
export interface AIModel {
	/**
	 * Model name identifier
	 */
	name: string;

	/**
	 * True if this model provides embedding functionality
	 */
	embeddings: boolean;

	/**
	 * True if this model provides LLM (text generation) functionality
	 */
	llm: boolean;

	/**
	 * True if this model supports tool/function calling
	 */
	tools: boolean;

	/**
	 * True if this model supports file inputs (images, documents, etc.)
	 */
	files: boolean;

	/**
	 * True if this model supports reasoning/chain-of-thought
	 */
	reasoning: boolean;

	/**
	 * Generate embeddings for multiple texts in a single batch
	 * @param texts Array of texts to generate embeddings for
	 * @returns Either an error or array of embedding vectors
	 */
	embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>>;

	/**
	 * Perform OCR (Optical Character Recognition) on a file
	 * @param file The file to extract text from
	 * @returns Either an error or the extracted text
	 */
	ocr(file: File): Promise<Either<AntboxError, string>>;

	/**
	 * Interactive chat with history and tool support
	 * Only available if llm is true
	 * @param text User message text to send
	 * @param options Optional configuration (system prompt, history, tools, files, temperature, etc.)
	 * @returns Either an error or ChatMessage response with complete history (may include tool calls to be executed by caller)
	 */
	chat?(
		text: string,
		options?: {
			systemPrompt?: string;
			history?: ChatHistory;
			tools?: Partial<FeatureDTO>[];
			files?: File[];
			temperature?: number;
			maxTokens?: number;
			reasoning?: boolean;
			structuredOutput?: string;
		},
	): Promise<
		Either<AntboxError, ChatMessage>
	>;

	/**
	 * One-shot question answering
	 * Only available if llm is true
	 * @param text Question text to answer
	 * @param options Optional configuration (system prompt, tools, files, temperature, etc.)
	 * @returns Either an error or ChatMessage response (may include tool calls)
	 */
	answer?(
		text: string,
		options?: {
			systemPrompt?: string;
			tools?: Partial<FeatureDTO>[];
			files?: File[];
			temperature?: number;
			maxTokens?: number;
			reasoning?: boolean;
			structuredOutput?: string;
		},
	): Promise<Either<AntboxError, ChatMessage>>;
}
