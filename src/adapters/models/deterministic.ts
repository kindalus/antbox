import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { AIModel, Embedding } from "application/ai_model.ts";
import { isEmbeddingsSupportedMimetype } from "application/embeddings_supported_mimetypes.ts";

export class UnsupportedMimetypeError extends AntboxError {
	constructor(mimetype: string) {
		super("UnsupportedMimetype", `Mimetype ${mimetype} is not supported for text extraction`);
	}
}

export class TextExtractionError extends AntboxError {
	constructor(mimetype: string, cause: unknown) {
		super("TextExtractionError", `Failed to extract text from ${mimetype}: ${cause}`);
	}
}

/**
 * Factory function to build a DeterministicModel
 * @param modelName The name of the model
 * @param dimensions Optional dimension size (default: 1536)
 */
export default function buildDeterministicModel(
	modelName: string,
	dimensions?: string,
): Promise<Either<AntboxError, AIModel>> {
	const dims = dimensions ? parseInt(dimensions, 10) : 1536;
	return Promise.resolve(right(new DeterministicModel(modelName, dims)));
}

/**
 * Deterministic implementation of AIModel for testing and development
 * Generates deterministic embeddings based on text content using a simple hashing algorithm
 * The same text will always produce the same embedding vector
 */
export class DeterministicModel implements AIModel {
	readonly modelName: string;
	readonly embeddings = true;
	readonly llm = false;
	readonly tools = false;
	readonly files = true;
	readonly reasoning = false;

	private readonly dimensions: number;

	/**
	 * Create a new DeterministicModel
	 * @param name The model name identifier
	 * @param dimensions The dimension size for generated embeddings (default: 1536 to match OpenAI)
	 */
	constructor(name: string, dimensions = 1536) {
		this.modelName = name;
		this.dimensions = dimensions;
	}

	/**
	 * Generate embeddings for multiple texts in a batch
	 */
	embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>> {
		const embeddings = texts.map((text) => this.#createDeterministicEmbedding(text));
		return Promise.resolve(right(embeddings));
	}

	/**
	 * Perform OCR on a file
	 */
	async ocr(file: File): Promise<Either<AntboxError, string>> {
		const mimetype = file.type;

		if (!isEmbeddingsSupportedMimetype(mimetype)) {
			return left(new UnsupportedMimetypeError(mimetype));
		}

		try {
			// For now, we only support text/plain, text/markdown, text/html
			// Other mimetypes will be added in future implementations
			if (
				mimetype === "text/plain" || mimetype === "text/markdown" || mimetype === "text/html"
			) {
				const content = new Uint8Array(await file.arrayBuffer());
				const text = new TextDecoder().decode(content);
				return right(text);
			}

			// For unsupported mimetypes within our allowed list, return error
			return left(
				new TextExtractionError(
					mimetype,
					"Only text/plain, text/markdown, and text/html are currently implemented",
				),
			);
		} catch (error) {
			return left(new TextExtractionError(mimetype, error));
		}
	}

	/**
	 * Create a deterministic embedding vector based on text content
	 * The same text will always produce the same vector
	 */
	#createDeterministicEmbedding(text: string): Embedding {
		const embedding: number[] = new Array(this.dimensions);

		// Use a simple deterministic hash based on character codes
		// This ensures the same text always produces the same embedding
		const hash = this.#simpleHash(text);

		for (let i = 0; i < this.dimensions; i++) {
			// Create pseudo-random but deterministic values based on hash and position
			const seed = hash + i;
			const value = Math.sin(seed) * 10000;
			embedding[i] = value - Math.floor(value); // Get fractional part [0, 1)
		}

		// Normalize the vector to unit length (required for cosine similarity)
		return this.#normalize(embedding);
	}

	/**
	 * Simple deterministic hash function for strings
	 */
	#simpleHash(text: string): number {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			const char = text.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash);
	}

	/**
	 * Normalize a vector to unit length
	 * This is important for cosine similarity calculations
	 */
	#normalize(vector: number[]): number[] {
		const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
		return vector.map((val) => val / magnitude);
	}
}
