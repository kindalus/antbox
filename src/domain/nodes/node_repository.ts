import { type Either } from "shared/either.ts";
import { type NodeFilter, type NodeFilters2D } from "./node_filter.ts";
import { NodeNotFoundError } from "./node_not_found_error.ts";
import type { DuplicatedNodeError } from "./duplicated_node_error.ts";
import { NodeLike } from "domain/node_like.ts";

export interface NodeFilterResult {
	pageToken: number;
	pageSize: number;
	nodes: NodeLike[];
	scores?: Record<string, number>;
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
}
