import { Either, left, right } from "shared/either.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import type {
	VectorDatabase,
	VectorEntry,
	VectorSearchResult,
} from "application/vector_database.ts";
import type { Embedding } from "application/ai_model.ts";

export default function buildInmemVectorDatabase(): Promise<
	Either<AntboxError, VectorDatabase>
> {
	return Promise.resolve(right(new InMemoryVectorDatabase()));
}

/**
 * In-memory implementation of VectorDatabase for development and testing
 * Stores vectors in memory and performs cosine similarity search
 */
export class InMemoryVectorDatabase implements VectorDatabase {
	private vectors: Map<string, VectorEntry> = new Map();

	/**
	 * Store a vector embedding with associated metadata
	 */
	upsert(entry: VectorEntry): Promise<Either<AntboxError, void>> {
		try {
			this.vectors.set(entry.id, entry);
			return Promise.resolve(right(undefined));
		} catch (error) {
			return Promise.resolve(left(new UnknownError((error as Error).message)));
		}
	}

	/**
	 * Store multiple vector embeddings in a batch
	 */
	upsertBatch(entries: VectorEntry[]): Promise<Either<AntboxError, void>> {
		try {
			for (const entry of entries) {
				this.vectors.set(entry.id, entry);
			}
			return Promise.resolve(right(undefined));
		} catch (error) {
			return Promise.resolve(left(new UnknownError((error as Error).message)));
		}
	}

	/**
	 * Search for similar vectors using cosine similarity
	 * @param queryVector The query vector to search with
	 * @param tenant The tenant to filter results by
	 * @param topK Number of top results to return
	 * @param filter Optional metadata filters (e.g., {mimetype: "text/plain"})
	 */
	search(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult[]>> {
		try {
			// Calculate cosine similarity for each candidate
			const results: VectorSearchResult[] = Array.from(this.vectors.values()).map((entry) => ({
				id: entry.id,
				nodeUuid: entry.metadata.nodeUuid,
				score: this.#cosineSimilarity(queryVector, entry.vector),
				metadata: entry.metadata,
			}));

			// Sort by similarity score (highest first) and take top K
			results.sort((a, b) => b.score - a.score);
			const topResults = results.slice(0, topK);

			return Promise.resolve(right(topResults));
		} catch (error) {
			return Promise.resolve(left(new UnknownError((error as Error).message)));
		}
	}

	/**
	 * Delete a vector entry by ID
	 */
	delete(id: string): Promise<Either<AntboxError, void>> {
		try {
			this.vectors.delete(id);
			return Promise.resolve(right(undefined));
		} catch (error) {
			return Promise.resolve(left(new UnknownError((error as Error).message)));
		}
	}

	/**
	 * Delete vector entries by node UUID
	 */
	deleteByNodeUuid(nodeUuid: string): Promise<Either<AntboxError, void>> {
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

			return Promise.resolve(right(undefined));
		} catch (error) {
			return Promise.resolve(left(new UnknownError((error as Error).message)));
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
