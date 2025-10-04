import { Either, left, right } from "shared/either.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import type {
	VectorDatabase,
	VectorEntry,
	VectorSearchResult,
} from "application/ai/vector_database.ts";
import type { Embedding } from "application/ai/ai_model.ts";

/**
 * In-memory implementation of VectorDatabase for development and testing
 * Stores vectors in memory and performs cosine similarity search
 */
export class InMemoryVectorDatabase implements VectorDatabase {
	private vectors: Map<string, VectorEntry> = new Map();

	/**
	 * Store a vector embedding with associated metadata
	 */
	async upsert(entry: VectorEntry): Promise<Either<AntboxError, void>> {
		try {
			this.vectors.set(entry.id, entry);
			return right(undefined);
		} catch (error) {
			return left(new UnknownError((error as Error).message));
		}
	}

	/**
	 * Store multiple vector embeddings in a batch
	 */
	async upsertBatch(entries: VectorEntry[]): Promise<Either<AntboxError, void>> {
		try {
			for (const entry of entries) {
				this.vectors.set(entry.id, entry);
			}
			return right(undefined);
		} catch (error) {
			return left(new UnknownError((error as Error).message));
		}
	}

	/**
	 * Search for similar vectors using cosine similarity
	 * @param queryVector The query vector to search with
	 * @param tenant The tenant to filter results by
	 * @param topK Number of top results to return
	 * @param filter Optional metadata filters (e.g., {mimetype: "text/plain"})
	 */
	async search(
		queryVector: Embedding,
		tenant: string,
		topK: number,
		filter?: Record<string, unknown>,
	): Promise<Either<AntboxError, VectorSearchResult[]>> {
		try {
			// Filter vectors by tenant and optional metadata filters
			const candidateVectors = Array.from(this.vectors.values()).filter(
				(entry) => {
					// Must match tenant
					if (entry.metadata.tenant !== tenant) {
						return false;
					}

					// Apply optional metadata filters
					if (filter) {
						for (const [key, value] of Object.entries(filter)) {
							if (entry.metadata[key as keyof typeof entry.metadata] !== value) {
								return false;
							}
						}
					}

					return true;
				},
			);

			// Calculate cosine similarity for each candidate
			const results: VectorSearchResult[] = candidateVectors.map((entry) => ({
				id: entry.id,
				nodeUuid: entry.metadata.nodeUuid,
				score: this.#cosineSimilarity(queryVector, entry.vector),
				metadata: entry.metadata,
			}));

			// Sort by similarity score (highest first) and take top K
			results.sort((a, b) => b.score - a.score);
			const topResults = results.slice(0, topK);

			return right(topResults);
		} catch (error) {
			return left(new UnknownError((error as Error).message));
		}
	}

	/**
	 * Delete a vector entry by ID
	 */
	async delete(id: string): Promise<Either<AntboxError, void>> {
		try {
			this.vectors.delete(id);
			return right(undefined);
		} catch (error) {
			return left(new UnknownError((error as Error).message));
		}
	}

	/**
	 * Delete vector entries by node UUID
	 */
	async deleteByNodeUuid(nodeUuid: string): Promise<Either<AntboxError, void>> {
		try {
			const idsToDelete: string[] = [];

			for (const [id, entry] of this.vectors.entries()) {
				if (entry.metadata.nodeUuid === nodeUuid) {
					idsToDelete.push(id);
				}
			}

			for (const id of idsToDelete) {
				this.vectors.delete(id);
			}

			return right(undefined);
		} catch (error) {
			return left(new UnknownError((error as Error).message));
		}
	}

	/**
	 * Calculate cosine similarity between two vectors
	 * Formula: similarity = (A · B) / (||A|| × ||B||)
	 * Returns a value between -1 and 1, where 1 means identical vectors
	 */
	#cosineSimilarity(vectorA: Embedding, vectorB: Embedding): number {
		if (vectorA.length !== vectorB.length) {
			throw new Error("Vectors must have the same length");
		}

		// Calculate dot product (A · B)
		let dotProduct = 0;
		for (let i = 0; i < vectorA.length; i++) {
			dotProduct += vectorA[i] * vectorB[i];
		}

		// Calculate magnitudes (||A|| and ||B||)
		let magnitudeA = 0;
		let magnitudeB = 0;
		for (let i = 0; i < vectorA.length; i++) {
			magnitudeA += vectorA[i] * vectorA[i];
			magnitudeB += vectorB[i] * vectorB[i];
		}
		magnitudeA = Math.sqrt(magnitudeA);
		magnitudeB = Math.sqrt(magnitudeB);

		// Avoid division by zero
		if (magnitudeA === 0 || magnitudeB === 0) {
			return 0;
		}

		// Calculate cosine similarity
		return dotProduct / (magnitudeA * magnitudeB);
	}

	/**
	 * Get the total number of stored vectors (useful for testing)
	 */
	size(): number {
		return this.vectors.size;
	}

	/**
	 * Clear all stored vectors (useful for testing)
	 */
	clear(): void {
		this.vectors.clear();
	}
}
