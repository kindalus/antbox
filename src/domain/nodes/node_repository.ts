import { type Either } from "shared/either.ts";
import { type NodeFilter, type NodeFilters2D } from "./node_filter.ts";
import { NodeNotFoundError } from "./node_not_found_error.ts";
import type { DuplicatedNodeError } from "./duplicated_node_error.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import { NodeLike } from "domain/node_like.ts";
import type { Embedding } from "./embedding.ts";

export interface NodeFilterResult {
	pageToken: number;
	pageSize: number;
	nodes: NodeLike[];
}

export interface VectorSearchResult {
	nodes: Array<{
		node: NodeLike;
		score: number;
		content: string;
	}>;
}

/** Indexing outcome stored per node. A node without a status (null) has never been processed. */
export type EmbeddingStatus = "indexed" | "failed" | "skipped";

export interface EmbeddingStatusRecord {
	status: EmbeddingStatus | null;
	/** Last indexing error, kept while the status is "failed". */
	error?: string;
	/** ISO time of the last status change. */
	at?: string;
}

export type EmbeddingStatusCounts = Record<EmbeddingStatus | "pending", number>;

export interface VectorSearchOptions {
	/**
	 * Applied before the topK cut, with the same meaning as in filter():
	 * [] matches every node and [[["uuid", "in", []]]] matches none.
	 */
	filters?: NodeFilters2D;
}

export interface NodeRepository {
	delete(uuid: string): Promise<Either<NodeNotFoundError, void>>;
	update(node: NodeLike): Promise<Either<NodeNotFoundError, void>>;
	/**
	 * Set modifiedTime to the current time without changing any other stored fields.
	 * The update must be atomic with respect to other repository writes. Missing nodes return Left;
	 * this operation must never create a node.
	 */
	touch(uuid: string): Promise<Either<AntboxError, void>>;
	add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>>;
	getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>>;
	getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>>;
	getEmbeddingContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>>;
	filter(
		filters: NodeFilter[] | NodeFilters2D,
		pageSize?: number,
		pageToken?: number,
	): Promise<NodeFilterResult>;

	/**
	 * Indicates if this repository implementation supports vector embeddings
	 */
	supportsEmbeddings(): boolean;

	/**
	 * Store or update a vector embedding for a node
	 * @param uuid The node UUID
	 * @param embedding The vector embedding to store
	 * @param contentMd Markdown content (with YAML frontmatter) used for embedding
	 */
	upsertEmbedding(
		uuid: string,
		embedding: Embedding,
		contentMd: string,
	): Promise<Either<AntboxError, void>>;

	/**
	 * Search for similar nodes using vector similarity
	 * @param queryVector The query vector to search with
	 * @param topK Number of top results to return, counted after options.filters
	 * @param options Filters applied before the topK cut
	 */
	vectorSearch(
		queryVector: Embedding,
		topK: number,
		options?: VectorSearchOptions,
	): Promise<Either<AntboxError, VectorSearchResult>>;

	/**
	 * Delete the embedding, its content and its status for a node
	 * @param uuid The node UUID
	 */
	deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>>;

	/**
	 * Record an indexing outcome other than "indexed", which upsertEmbedding sets.
	 * "failed" keeps any stored vector; "skipped" removes the vector and its content.
	 * update() and touch() never change the status.
	 */
	setEmbeddingStatus(
		uuid: string,
		status: "failed" | "skipped",
		error?: string,
	): Promise<Either<AntboxError, void>>;

	/** Statuses of the given nodes. Unknown uuids are left out. */
	getEmbeddingStatuses(
		uuids: string[],
	): Promise<Either<AntboxError, Record<string, EmbeddingStatusRecord>>>;

	/** Number of nodes per status; nodes without a status are counted as pending. */
	countEmbeddingStatuses(): Promise<Either<AntboxError, EmbeddingStatusCounts>>;

	/**
	 * Calculates the total size of all stored files in bytes.
	 * Does not include folder nodes or system overhead.
	 */
	aggregateTotalSize(): Promise<Either<AntboxError, number>>;
}
