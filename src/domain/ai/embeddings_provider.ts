import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Embedding } from "domain/nodes/embedding.ts";

export type { Embedding };

/**
 * EmbeddingsProvider - Generates vector embeddings for texts
 *
 * Implementations can use various embedding services (Google, OpenAI, etc.)
 */
export interface EmbeddingsProvider {
	/**
	 * Generate embeddings for multiple texts in a single batch
	 * @param texts Array of texts to generate embeddings for
	 * @returns Either an error or array of embedding vectors
	 */
	embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>>;

	/**
	 * Relevance threshold used by semantic search for this provider.
	 *
	 * Values are expected in [0, 1].
	 */
	relevanceThreshold(): number;
}
