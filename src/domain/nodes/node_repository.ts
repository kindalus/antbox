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
	}>;
}

export interface NodeRepository {
	delete(uuid: string): Promise<Either<NodeNotFoundError, void>>;
	update(node: NodeLike): Promise<Either<NodeNotFoundError, void>>;
	add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>>;
	getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>>;
	getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>>;
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
	 */
	upsertEmbedding(uuid: string, embedding: Embedding): Promise<Either<AntboxError, void>>;

	/**
	 * Search for similar nodes using vector similarity
	 * @param queryVector The query vector to search with
	 * @param topK Number of top results to return
	 */
	vectorSearch(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult>>;

	/**
	 * Delete the embedding for a node
	 * @param uuid The node UUID
	 */
	deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>>;
}
