import { Node } from "domain/nodes/node.ts";
import { NodeFilter } from "domain/nodes/node_filter.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import {
  NodeFilterResult,
  NodeRepository,
} from "domain/nodes/node_repository.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, right } from "shared/either.ts";

export class NullNodeRepository implements NodeRepository {
  get(_uuid: string): Promise<Either<AntboxError, Node>> {
    return Promise.resolve(right(new Node()));
  }

  add(_node: Node): Promise<Either<AntboxError, void>> {
    return Promise.resolve(right(undefined));
  }

  delete(_uuid: string): Promise<Either<AntboxError, void>> {
    return Promise.resolve(right(undefined));
  }

  update(_node: Node): Promise<Either<NodeNotFoundError, void>> {
    return Promise.resolve(right(undefined));
  }

  getByFid(_fid: string): Promise<Either<NodeNotFoundError, Node>> {
    return Promise.resolve(right(new Node()));
  }

  getById(_uuid: string): Promise<Either<NodeNotFoundError, Node>> {
    return Promise.resolve(right(new Node()));
  }

  filter(
    _filters: NodeFilter[],
    pageSize: number,
    pageToken: number,
  ): Promise<NodeFilterResult> {
    return Promise.resolve({
      nodes: [],
      pageToken,
      pageCount: 0,
      pageSize,
    });
  }
}

export default function buildNullNodeRepository(): Promise<
  Either<AntboxError, NodeRepository>
> {
  return Promise.resolve(right(new NullNodeRepository()));
}
