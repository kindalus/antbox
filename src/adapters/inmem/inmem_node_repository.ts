import type { NodeFilters, OrNodeFilter } from "domain/nodes/node_filter";
import { withNodeFilters } from "domain/nodes/node_filters";
import type { NodeLike } from "domain/nodes/node_like";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import type {
  NodeRepository,
  NodeFilterResult,
} from "domain/nodes/node_repository";
import { Nodes } from "domain/nodes/nodes";
import { type Either, right, left } from "shared/either";

export class InMemoryNodeRepository implements NodeRepository {
  readonly #data: Record<string, NodeLike>;

  constructor(data: Record<string, NodeLike> = {}) {
    this.#data = data;
  }

  get data(): Record<string, NodeLike> {
    return this.#data as Record<string, NodeLike>;
  }

  delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    delete this.#data[uuid];

    return Promise.resolve(right(undefined));
  }

  get records(): NodeLike[] {
    return Object.values(this.#data) as NodeLike[];
  }

  get count(): number {
    return this.records.length;
  }

  add(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
    this.#data[node.uuid] = node;
    return Promise.resolve(right(undefined));
  }

  update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
    this.#data[node.uuid] = node;
    return Promise.resolve(right(undefined));
  }

  getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    const node = this.records.find((n) => n.fid === fid);

    if (!node) {
      return Promise.resolve(left(new NodeNotFoundError(Nodes.fidToUuid(fid))));
    }

    return Promise.resolve(right(node));
  }

  getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
    const metadata = this.records.find((n) => n.uuid === uuid);

    if (!metadata) {
      return Promise.resolve(left(new NodeNotFoundError(uuid)));
    }

    return Promise.resolve(right(metadata));
  }

  filter(
    filters: NodeFilters | OrNodeFilter,
    pageSize: number,
    pageToken: number,
  ): Promise<NodeFilterResult> {
    const firstIndex = (pageToken - 1) * pageSize;
    const lastIndex = firstIndex + pageSize;

    const filtered = this.records.filter(
      withNodeFilters(filters as NodeFilters),
    );

    const nodes = filtered.slice(firstIndex, lastIndex);

    const pageCount = Math.ceil(filtered.length / pageSize);

    return Promise.resolve({ nodes, pageCount, pageSize, pageToken });
  }
}
