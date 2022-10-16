import { EcmError } from "/shared/ecm_error.ts";
import { Node } from "./node.ts";
import { NodeFilter } from "./node_filter.ts";
import { Either } from "../../shared/either.ts";
import { NodeNotFoundError } from "./node_not_found_error.ts";

export interface NodeFilterResult {
  pageToken: number;
  pageSize: number;
  pageCount: number;
  nodes: Array<Node>;
}

export interface NodeRepository {
  delete(uuid: string): Promise<Either<NodeNotFoundError, void>>;
  update(node: Node): Promise<Either<NodeNotFoundError, void>>;
  add(node: Node): Promise<Either<EcmError, void>>;
  getByFid(fid: string): Promise<Either<NodeNotFoundError, Node>>;
  getById(uuid: string): Promise<Either<NodeNotFoundError, Node>>;
  filter(
    filters: NodeFilter[],
    pageSize: number,
    pageToken: number
  ): Promise<NodeFilterResult>;
}
