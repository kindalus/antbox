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

/** Text stored for a node besides its metadata: the markdown and the full-text search fields. */
export interface NodeContent {
	/** Markdown with the full YAML frontmatter and the extracted body, if any. */
	markdown: string;
	/** Searchable metadata as plain text: title, description, tags, searchable aspect values. */
	searchMeta?: string;
	/** Extracted file text without frontmatter. Empty until text extraction runs. */
	searchBody?: string;
}

export interface FtsOptions {
	/**
	 * Applied before pagination, with the same meaning as in filter():
	 * [] matches every node and [[["uuid", "in", []]]] matches none.
	 */
	filters?: NodeFilters2D;
	pageSize: number;
	pageToken: number;
}

export interface FtsResult extends NodeFilterResult {
	/** Relevance per returned node, in [0, 1]. Comparable only within one repository. */
	scores: Record<string, number>;
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
	/** Stored markdown of the given nodes. Nodes without markdown are left out. */
	getContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>>;

	/**
	 * Store a node's markdown and full-text search fields. Omitted search fields keep their
	 * stored value. Never changes the embedding vector or its status. Missing nodes return Left.
	 * The content is removed with the node.
	 */
	saveContent(uuid: string, content: NodeContent): Promise<Either<AntboxError, void>>;

	/**
	 * Full-text search over searchMeta and searchBody with the repository's native engine, best
	 * match first. A match in searchMeta ranks above one in searchBody. The query is plain text:
	 * search syntax in it is never interpreted, and a query without words matches nothing.
	 * options.filters, including permissions, apply before pagination.
	 */
	fts(query: string, options: FtsOptions): Promise<Either<AntboxError, FtsResult>>;

	/** Up to limit uuids of nodes whose searchMeta was never stored, for the startup migration. */
	listWithoutSearchContent(limit: number): Promise<Either<AntboxError, string[]>>;

	/**
	 * Filters nodes by their metadata. `["fulltext", "match", …]` filters are not supported here
	 * and match nothing; full-text search goes through fts().
	 */
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
	 * Store or update a vector embedding for a node and mark it "indexed". The markdown it was
	 * computed from is stored separately with saveContent.
	 */
	upsertEmbedding(uuid: string, embedding: Embedding): Promise<Either<AntboxError, void>>;

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

	/** Delete the embedding vector and its status. The stored content stays until the node goes. */
	deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>>;

	/**
	 * Record an indexing outcome other than "indexed", which upsertEmbedding sets.
	 * "failed" keeps any stored vector; "skipped" removes the vector. Both keep the stored content,
	 * so the node stays searchable by its metadata.
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
