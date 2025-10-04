import { Either } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";

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
	 * Generate embeddings for multiple texts in a single batch
	 * @param texts Array of texts to generate embeddings for
	 * @returns Either an error or array of embedding vectors
	 */
	embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>>;

	/**
	 * Check if this model provides embedding functionality
	 * @returns true if the model can generate embeddings
	 */
	provideEmbeddings(): boolean;

	/**
	 * Check if this model provides LLM (text generation) functionality
	 * @returns true if the model can generate text responses
	 */
	provideLLM(): boolean;

	/**
	 * Check if this model supports tool/function calling
	 * @returns true if the model supports tools
	 */
	supportTools(): boolean;

	/**
	 * Check if this model supports file inputs (images, documents, etc.)
	 * @returns true if the model can process files
	 */
	supportFiles(): boolean;

	/**
	 * Check if this model supports reasoning/chain-of-thought
	 * @returns true if the model supports reasoning
	 */
	supportReasoning(): boolean;

	/**
	 * Perform OCR (Optical Character Recognition) on a file
	 * @param file The file to extract text from
	 * @returns Either an error or the extracted text
	 */
	ocr(file: File): Promise<Either<AntboxError, string>>;
}
