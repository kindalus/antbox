import { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import { NodeFactory } from "domain/node_factory.ts";
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
import { type AntboxError, BadRequestError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { NodesFilters } from "domain/nodes_filters.ts";

/**
 * Builds an in-memory NodeRepository.
 *
 * @remarks
 * External setup: none. Data resets when the process exits.
 *
 * @example
 * const repoOrErr = await buildInmemNodeRepository();
 * if (repoOrErr.isRight()) {
 *   const repo = repoOrErr.value;
 * }
 */
export default function buildInmemNodeRepository(): Promise<
	Either<AntboxError, NodeRepository>
> {
	return Promise.resolve(right(new InMemoryNodeRepository()));
}

interface NodeWithEmbedding {
	node: NodeLike;
	embedding?: Embedding;
	contentMd?: string;
}

export class InMemoryNodeRepository implements NodeRepository {
	readonly #data: Record<string, NodeWithEmbedding>;

	constructor(data: Record<string, NodeLike> = {}) {
		this.#data = Object.create(null);
		for (const [key, node] of Object.entries(data)) {
			this.#data[key] = { node: this.#snapshot(node).right };
		}
	}

	get data(): Record<string, NodeLike> {
		const result: Record<string, NodeLike> = Object.create(null);
		for (const [key, value] of Object.entries(this.#data)) {
			result[key] = this.#snapshot(value.node).right;
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
		return Object.values(this.#data).map((v) => this.#snapshot(v.node).right);
	}

	set records(records: NodeLike[]) {
		const snapshots = records.map((node) => this.#snapshot(node).right);
		Object.keys(this.#data).forEach((k) => delete this.#data[k]);
		snapshots.forEach((r) => {
			this.#data[r.uuid] = { node: r };
		});
	}

	get count(): number {
		return Object.keys(this.#data).length;
	}

	add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>> {
		if (this.#data[node.uuid]) {
			return Promise.resolve(left(new DuplicatedNodeError(node.uuid)));
		}
		const snapshot = this.#snapshot(node);
		if (snapshot.isLeft()) return Promise.resolve(left(snapshot.value));
		this.#data[node.uuid] = { node: snapshot.value };
		return Promise.resolve(right(undefined));
	}

	update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
		const existing = this.#data[node.uuid];
		if (!existing) {
			return Promise.resolve(left(new NodeNotFoundError(node.uuid)));
		}
		const snapshot = this.#snapshot(node);
		if (snapshot.isLeft()) return Promise.resolve(left(snapshot.value));

		this.#data[node.uuid] = {
			node: snapshot.value,
			embedding: existing.embedding,
			contentMd: existing.contentMd,
		};
		return Promise.resolve(right(undefined));
	}

	touch(uuid: string): Promise<Either<AntboxError, void>> {
		const existing = this.#data[uuid];
		if (!existing) return Promise.resolve(left(new NodeNotFoundError(uuid)));
		const updated = NodeFactory.from({
			...existing.node.metadata,
			modifiedTime: new Date().toISOString(),
		});
		if (updated.isLeft()) return Promise.resolve(left(updated.value));
		existing.node = updated.value;
		return Promise.resolve(right(undefined));
	}

	getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		const entry = Object.values(this.#data).find((v) => v.node.fid === fid);

		if (!entry) {
			return Promise.resolve(left(new NodeNotFoundError(Nodes.fidToUuid(fid))));
		}

		return Promise.resolve(this.#snapshot(entry.node));
	}

	getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		const entry = this.#data[uuid];

		if (!entry) {
			return Promise.resolve(left(new NodeNotFoundError(uuid)));
		}

		return Promise.resolve(this.#snapshot(entry.node));
	}

	getEmbeddingContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>> {
		const contents: Record<string, string> = Object.create(null);

		for (const uuid of uuids) {
			const contentMd = this.#data[uuid]?.contentMd;
			if (typeof contentMd === "string" && contentMd.length > 0) {
				contents[uuid] = contentMd;
			}
		}

		return Promise.resolve(right(contents));
	}

	filter(
		filters: NodeFilters,
		pageSize = 20,
		pageToken = 1,
	): Promise<NodeFilterResult> {
		const firstIndex = (pageToken - 1) * pageSize;
		const lastIndex = firstIndex + pageSize;

		const spec = NodesFilters.nodeSpecificationFrom(filters);
		const filtered = Object.values(this.#data).map((entry) => entry.node)
			.filter((n) => spec.isSatisfiedBy(n).isRight())
			.sort((a, b) => a.title.localeCompare(b.title));

		const nodes = filtered.slice(firstIndex, lastIndex).map((node) => this.#snapshot(node).right);

		return Promise.resolve({ nodes, pageSize, pageToken });
	}

	supportsEmbeddings(): boolean {
		return true;
	}

	upsertEmbedding(
		uuid: string,
		embedding: Embedding,
		contentMd: string,
	): Promise<Either<AntboxError, void>> {
		const entry = this.#data[uuid];
		if (!entry) {
			return Promise.resolve(left(new BadRequestError(`Node ${uuid} not found`)));
		}

		try {
			entry.embedding = structuredClone(embedding);
		} catch (error) {
			return Promise.resolve(left(new UnknownError((error as Error).message)));
		}
		entry.contentMd = contentMd;
		return Promise.resolve(right(undefined));
	}

	vectorSearch(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult>> {
		const results: VectorSearchResult["nodes"] = [];

		for (const entry of Object.values(this.#data)) {
			if (entry.embedding) {
				const score = this.#cosineSimilarity(queryVector, entry.embedding);
				results.push({
					node: entry.node,
					score,
					content: entry.contentMd ?? "",
				});
			}
		}

		results.sort((a, b) => b.score - a.score);
		const topResults = results.slice(0, topK).map((result) => ({
			...result,
			node: this.#snapshot(result.node).right,
		}));

		return Promise.resolve(right({ nodes: topResults }));
	}

	deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		const entry = this.#data[uuid];
		if (entry) {
			entry.embedding = undefined;
			entry.contentMd = undefined;
		}
		return Promise.resolve(right(undefined));
	}

	aggregateTotalSize(): Promise<Either<AntboxError, number>> {
		let total = 0;
		for (const key in this.#data) {
			const node = this.#data[key].node as { size?: number };
			if (typeof node.size === "number") {
				total += node.size;
			}
		}
		return Promise.resolve(right(total));
	}

	#snapshot(node: NodeLike): Either<AntboxError, NodeLike> {
		try {
			return NodeFactory.from(structuredClone(node.metadata));
		} catch (error) {
			return left(new UnknownError((error as Error).message));
		}
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
