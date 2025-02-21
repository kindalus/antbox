import { withNodeFilters } from "../../domain/nodes/filters_spec.ts";
import { Node } from "../../domain/nodes/node.ts";
import { NodeFilter } from "../../domain/nodes/node_filter.ts";
import { NodeLike } from "../../domain/nodes/node_like.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import { NodeFilterResult, NodeRepository } from "../../domain/nodes/node_repository.ts";
import { Nodes } from "../../domain/nodes/nodes.ts";
import { Either, left, right } from "../../shared/either.ts";

export class InMemoryNodeRepository implements NodeRepository {
	readonly #data: Record<string, NodeLike>;

	constructor(data: Record<string, NodeLike> = {}) {
		this.#data = data;
	}

	get data(): Record<string, Node> {
		return this.#data as Record<string, Node>;
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
		filters: NodeFilter[],
		pageSize: number,
		pageToken: number,
	): Promise<NodeFilterResult> {
		const firstIndex = (pageToken - 1) * pageSize;
		const lastIndex = firstIndex + pageSize;

		const filtered = this.records.filter(withNodeFilters(filters));

		const nodes = filtered.slice(firstIndex, lastIndex);

		const pageCount = Math.ceil(filtered.length / pageSize);

		return Promise.resolve({ nodes, pageCount, pageSize, pageToken });
	}
}
