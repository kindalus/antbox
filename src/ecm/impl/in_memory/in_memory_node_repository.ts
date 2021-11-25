import Node, { NodeFilter } from "../../node.js";
import NodeRepository from "../../node_repository.js";
import { NodeFilterResult } from "../../node_service.js";

export default class InMemoryNodeRepository implements NodeRepository {
	constructor(readonly db: Record<string, Partial<Node>> = {}) {}

	delete(uuid: string): Promise<void> {
		delete this.db[uuid];

		return Promise.resolve();
	}

	get records(): Node[] {
		return Object.values(this.db) as Node[];
	}

	get count(): number {
		return this.records.length;
	}

	add(node: Node): Promise<void> {
		this.db[node.uuid] = node;
		return Promise.resolve();
	}

	update(node: Node): Promise<void> {
		this.db[node.uuid] = node;
		return Promise.resolve();
	}

	getByFid(fid: string): Promise<Node> {
		return Promise.resolve(this.records.find((n) => n.fid === fid) as Node);
	}

	getById(uuid: string): Promise<Node> {
		return Promise.resolve(this.db[uuid] as Node);
	}

	filter(
		constraints: NodeFilter[],
		pageSize: number,
		pageToken: number,
	): Promise<NodeFilterResult> {
		const firstIndex = (pageToken - 1) * pageSize;
		const lastIndex = firstIndex + pageSize;

		const filtered = this.filterNodesWith(constraints);
		const nodes = filtered.slice(firstIndex, lastIndex);

		const pageCount = Math.abs(filtered.length / pageSize) + 1;

		return Promise.resolve({ nodes, pageCount, pageSize, pageToken });
	}

	private filterNodesWith(constraints: NodeFilter[]) {
		const initialValue = () => true;

		return this.records.filter((node) =>
			constraints.reduce(
				(acc, cur) => this.matchNodeAndValue(node, acc, cur),
				initialValue(),
			),
		);
	}

	private matchNodeAndValue(
		node: Node,
		previous: boolean,
		filter: NodeFilter,
	): boolean {
		const [field, operator, value] = filter;
		const match = filterFns[operator];
		const comparison = match(node[field], value);

		return comparison && previous;
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
	"array-contains-any": <T>(a: T, b: T) => !(a as unknown as T[])?.includes(b),
};
