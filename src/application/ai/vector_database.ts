import { Either } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Embedding } from "./ai_model.ts";

/**
 * Represents a stored vector entry with metadata
 */
export interface VectorEntry {
	id: string;
	vector: Embedding;
	metadata: {
		nodeUuid: string;
		tenant: string;
		mimetype: string;
		title: string;
		model: string;
	};
}

/**
 * Represents a search result with similarity score
 */
export interface VectorSearchResult {
	id: string;
	nodeUuid: string;
	score: number;
	metadata: VectorEntry["metadata"];
}

/**
 * Interface for vector database operations
 * Implementations can use various vector databases (Pinecone, Weaviate, Qdrant, etc.)
 */
export interface VectorDatabase {
	/**
	 * Store a vector embedding with associated metadata
	 * @param entry The vector entry to store
	 * @returns Either an error or void on success
	 */
	upsert(entry: VectorEntry): Promise<Either<AntboxError, void>>;

	/**
	 * Store multiple vector embeddings in a batch
	 * @param entries Array of vector entries to store
	 * @returns Either an error or void on success
	 */
	upsertBatch(entries: VectorEntry[]): Promise<Either<AntboxError, void>>;

	/**
	 * Search for similar vectors using cosine similarity or other distance metrics
	 * @param queryVector The query vector to search with
	 * @param topK Number of top results to return
	 * @returns Either an error or array of search results
	 */
	search(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult[]>>;

	/**
	 * Delete a vector entry by ID
	 * @param id The ID of the entry to delete
	 * @returns Either an error or void on success
	 */
	delete(id: string): Promise<Either<AntboxError, void>>;

	/**
	 * Delete vector entries by node UUID
	 * @param nodeUuid The node UUID to delete entries for
	 * @returns Either an error or void on success
	 */
	deleteByNodeUuid(nodeUuid: string): Promise<Either<AntboxError, void>>;
}
