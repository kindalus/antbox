import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { type NodeFilter } from "./node_filter.ts";
import { type NodeLike } from "./node_like.ts";
import { NodeNotFoundError } from "./node_not_found_error.ts";

export interface NodeFilterResult {
  pageToken: number;
  pageSize: number;
  pageCount: number;
  nodes: NodeLike[];
}

export interface NodeRepository {
  delete(uuid: string): Promise<Either<NodeNotFoundError, void>>;
  update(node: NodeLike): Promise<Either<NodeNotFoundError, void>>;
  add(node: NodeLike): Promise<Either<AntboxError, void>>;
  getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>>;
  getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>>;
  filter(
    filters: NodeFilter[],
    pageSize: number,
    pageToken: number,
  ): Promise<NodeFilterResult>;
}
