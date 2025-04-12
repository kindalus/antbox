import type { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type {
  NodeFilterResult,
  NodeRepository,
} from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { NodesFilters } from "domain/nodes_filters.ts";

export default function buildInmemNodeRepository(): Promise<
  Either<AntboxError, NodeRepository>
> {
  return Promise.resolve(right(new InMemoryNodeRepository()));
}

export class InMemoryNodeRepository implements NodeRepository {
  readonly #data: Record<string, NodeLike>;

  constructor(data: Record<string, NodeLike> = {}) {
    this.#data = data;
  }

  get data(): Record<string, NodeLike> {
    return this.#data as Record<string, NodeLike>;
  }

  delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    if (!this.#data[uuid]) {
      return Promise.resolve(left(new NodeNotFoundError(uuid)));
    }

    delete this.#data[uuid];

    return Promise.resolve(right(undefined));
  }

  get records(): NodeLike[] {
    return Object.values(this.#data) as NodeLike[];
  }

  set records(records: NodeLike[]) {
    Object.keys(this.#data).forEach((k) => delete this.#data[k]);
    records.forEach((r) => {
      this.#data[r.uuid] = r;
    });
  }

  get count(): number {
    return this.records.length;
  }

  add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>> {
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
    filters: NodeFilters,
    pageSize = 20,
    pageToken = 1,
  ): Promise<NodeFilterResult> {
    const firstIndex = (pageToken - 1) * pageSize;
    const lastIndex = firstIndex + pageSize;

    const spec = NodesFilters.nodeSpecificationFrom(filters);
    const filtered = this.records.filter((n) =>
      spec.isSatisfiedBy(n).isRight()
    );

    const nodes = filtered.slice(firstIndex, lastIndex);

    return Promise.resolve({ nodes, pageSize, pageToken });
  }
}
