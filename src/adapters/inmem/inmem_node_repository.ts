import { NodeFilter } from "/domain/nodes/node_filter.ts";
import {
  NodeFilterResult,
  NodeRepository,
} from "/domain/nodes/node_repository.ts";
import { Node } from "/domain/nodes/node.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { Either, left, right } from "/shared/either.ts";

export class InMemoryNodeRepository implements NodeRepository {
  constructor(readonly db: Record<string, Partial<Node>> = {}) {}

  delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    delete this.db[uuid];

    return Promise.resolve(right(undefined));
  }

  get records(): Node[] {
    return Object.values(this.db) as Node[];
  }

  get count(): number {
    return this.records.length;
  }

  add(node: Node): Promise<Either<NodeNotFoundError, void>> {
    this.db[node.uuid] = node;
    return Promise.resolve(right(undefined));
  }

  update(node: Node): Promise<Either<NodeNotFoundError, void>> {
    this.db[node.uuid] = node;
    return Promise.resolve(right(undefined));
  }

  getByFid(fid: string): Promise<Either<NodeNotFoundError, Node>> {
    const node = this.records.find((n) => n.fid === fid);

    if (!node) {
      return Promise.resolve(left(new NodeNotFoundError(Node.fidToUuid(fid))));
    }

    return Promise.resolve(right(node));
  }

  getById(uuid: string): Promise<Either<NodeNotFoundError, Node>> {
    const node = this.records.find((n) => n.uuid === uuid);

    if (!node) {
      return Promise.resolve(left(new NodeNotFoundError(uuid)));
    }

    return Promise.resolve(right(node));
  }

  filter(
    constraints: NodeFilter[],
    pageSize: number,
    pageToken: number
  ): Promise<NodeFilterResult> {
    const firstIndex = (pageToken - 1) * pageSize;
    const lastIndex = firstIndex + pageSize;

    const filtered = constraints?.length
      ? this.filterNodesWith(constraints)
      : [];
    const nodes = filtered.slice(firstIndex, lastIndex);

    const pageCount = Math.ceil(filtered.length / pageSize);

    return Promise.resolve({ nodes, pageCount, pageSize, pageToken });
  }

  private filterNodesWith(constraints: NodeFilter[]) {
    const initialValue = () => true;

    return this.records.filter((node) =>
      constraints.reduce(
        (acc, cur) => this.matchNodeAndValue(node, acc, cur),
        initialValue()
      )
    );
  }

  private matchNodeAndValue(
    node: Node,
    previous: boolean,
    filter: NodeFilter
  ): boolean {
    const [field, operator, value] = filter;
    const fieldValue = this.getFieldValue(node, field);

    const match = filterFns[operator];
    const comparison = match(fieldValue, value);

    return comparison && previous;
  }

  private getFieldValue(node: Node, fieldPath: string) {
    const fields = fieldPath.split(".");

    // deno-lint-ignore no-explicit-any
    let acc: any = { ...node };

    for (const field of fields) {
      acc = acc?.[field];
    }

    return acc;
  }
}

export type FilterFn = <T>(a: T, b: T) => boolean;

export const filterFns: Record<string, FilterFn> = {
  "==": (a, b) => a === b,
  "<=": (a, b) => a <= b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  ">": (a, b) => a > b,
  "!=": (a, b) => a !== b,
  in: <T>(a: T, b: T) => (b as unknown as T[])?.includes(a),
  "not-in": <T>(a: T, b: T) => !(b as unknown as T[])?.includes(a),
  "array-contains": <T>(a: T, b: T) => (a as unknown as T[])?.includes(b),
  match: (a, b) => {
    const a1 = a as unknown as string;
    const b1 = b as unknown as string;

    const re = new RegExp(b1.replaceAll(/\s/g, ".*?"), "i");
    const match = a1?.match(re);

    return match !== undefined && match !== null;
  },
};
