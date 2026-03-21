import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Embedding } from "domain/nodes/embedding.ts";

import type { TokenUsage } from "domain/ai/chat_message.ts";

export type { Embedding };

export interface EmbeddingsResult {
	embeddings: Embedding[];
	usage: TokenUsage;
}

/**
 * EmbeddingsProvider - Generates vector embeddings for texts
 *
 * Implementations can use various embedding services (Google, OpenAI, etc.)
 */
export interface EmbeddingsProvider {
	/**
	 * Generate embeddings for multiple texts in a single batch
	 * @param texts Array of texts to generate embeddings for
	 * @returns Either an error or an object with embedding vectors and token usage
	 */
	embed(texts: string[]): Promise<Either<AntboxError, EmbeddingsResult>>;

	/**
	 * Relevance threshold used by semantic search for this provider.
	 *
	 * Values are expected in [0, 1].
	 */
	relevanceThreshold(): number;
}
