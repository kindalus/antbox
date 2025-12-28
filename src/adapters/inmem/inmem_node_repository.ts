import type { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import type { Embedding } from "domain/nodes/embedding.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type {
	NodeFilterResult,
	NodeRepository,
	VectorSearchResult,
} from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { type AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { NodesFilters } from "domain/nodes_filters.ts";

export default function buildInmemNodeRepository(): Promise<
	Either<AntboxError, NodeRepository>
> {
	return Promise.resolve(right(new InMemoryNodeRepository()));
}

interface NodeWithEmbedding {
	node: NodeLike;
	embedding?: Embedding;
}

export class InMemoryNodeRepository implements NodeRepository {
	readonly #data: Record<string, NodeWithEmbedding>;

	constructor(data: Record<string, NodeLike> = {}) {
		this.#data = {};
		for (const [key, node] of Object.entries(data)) {
			this.#data[key] = { node };
		}
	}

	get data(): Record<string, NodeLike> {
		const result: Record<string, NodeLike> = {};
		for (const [key, value] of Object.entries(this.#data)) {
			result[key] = value.node;
		}
		return result;
	}

	delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		if (!this.#data[uuid]) {
			return Promise.resolve(left(new NodeNotFoundError(uuid)));
		}

		delete this.#data[uuid];

		return Promise.resolve(right(undefined));
	}

	get records(): NodeLike[] {
		return Object.values(this.#data).map((v) => v.node);
	}

	set records(records: NodeLike[]) {
		Object.keys(this.#data).forEach((k) => delete this.#data[k]);
		records.forEach((r) => {
			this.#data[r.uuid] = { node: r };
		});
	}

	get count(): number {
		return this.records.length;
	}

	add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>> {
		this.#data[node.uuid] = { node };
		return Promise.resolve(right(undefined));
	}

	update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
		const existing = this.#data[node.uuid];
		this.#data[node.uuid] = { node, embedding: existing?.embedding };
		return Promise.resolve(right(undefined));
	}

	getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		const entry = Object.values(this.#data).find((v) => v.node.fid === fid);

		if (!entry) {
			return Promise.resolve(left(new NodeNotFoundError(Nodes.fidToUuid(fid))));
		}

		return Promise.resolve(right(entry.node));
	}

	getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		const entry = this.#data[uuid];

		if (!entry) {
			return Promise.resolve(left(new NodeNotFoundError(uuid)));
		}

		return Promise.resolve(right(entry.node));
	}

	filter(
		filters: NodeFilters,
		pageSize = 20,
		pageToken = 1,
	): Promise<NodeFilterResult> {
		const firstIndex = (pageToken - 1) * pageSize;
		const lastIndex = firstIndex + pageSize;

		const spec = NodesFilters.nodeSpecificationFrom(filters);
		const filtered = this.records
			.filter((n) => spec.isSatisfiedBy(n).isRight())
			.sort((a, b) => a.title.localeCompare(b.title));

		const nodes = filtered.slice(firstIndex, lastIndex);

		return Promise.resolve({ nodes, pageSize, pageToken });
	}

	supportsEmbeddings(): boolean {
		return true;
	}

	upsertEmbedding(uuid: string, embedding: Embedding): Promise<Either<AntboxError, void>> {
		const entry = this.#data[uuid];
		if (!entry) {
			return Promise.resolve(left(new BadRequestError(`Node ${uuid} not found`)));
		}

		entry.embedding = embedding;
		return Promise.resolve(right(undefined));
	}

	vectorSearch(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult>> {
		const results: Array<{ node: NodeLike; score: number }> = [];

		for (const entry of Object.values(this.#data)) {
			if (entry.embedding) {
				const score = this.#cosineSimilarity(queryVector, entry.embedding);
				results.push({ node: entry.node, score });
			}
		}

		results.sort((a, b) => b.score - a.score);
		const topResults = results.slice(0, topK);

		return Promise.resolve(right({ nodes: topResults }));
	}

	deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		const entry = this.#data[uuid];
		if (entry) {
			entry.embedding = undefined;
		}
		return Promise.resolve(right(undefined));
	}

	#cosineSimilarity(vectorA: Embedding, vectorB: Embedding): number {
		if (vectorA.length !== vectorB.length) {
			return 0;
		}

		let dotProduct = 0;
		let magnitudeA = 0;
		let magnitudeB = 0;

		for (let i = 0; i < vectorA.length; i++) {
			dotProduct += vectorA[i] * vectorB[i];
			magnitudeA += vectorA[i] * vectorA[i];
			magnitudeB += vectorB[i] * vectorB[i];
		}

		magnitudeA = Math.sqrt(magnitudeA);
		magnitudeB = Math.sqrt(magnitudeB);

		if (magnitudeA === 0 || magnitudeB === 0) {
			return 0;
		}

		return dotProduct / (magnitudeA * magnitudeB);
	}
}
