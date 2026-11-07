import { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import { NodeFactory } from "domain/node_factory.ts";
import type { Embedding } from "domain/nodes/embedding.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type {
	EmbeddingStatus,
	EmbeddingStatusCounts,
	EmbeddingStatusRecord,
	FtsOptions,
	FtsResult,
	NodeContent,
	NodeFilterResult,
	NodeRepository,
	VectorSearchOptions,
	VectorSearchResult,
} from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { type AntboxError, BadRequestError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { fulltextMatches } from "domain/nodes/fulltext.ts";

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
	markdown?: string;
	searchMeta?: string;
	searchBody?: string;
	status?: EmbeddingStatus;
	statusError?: string;
	statusAt?: string;
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

		this.#data[node.uuid] = { ...existing, node: snapshot.value };
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

	getContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>> {
		const contents: Record<string, string> = Object.create(null);

		for (const uuid of uuids) {
			const markdown = this.#data[uuid]?.markdown;
			if (typeof markdown === "string" && markdown.length > 0) {
				contents[uuid] = markdown;
			}
		}

		return Promise.resolve(right(contents));
	}

	saveContent(uuid: string, content: NodeContent): Promise<Either<AntboxError, void>> {
		const entry = this.#data[uuid];
		if (!entry) return Promise.resolve(left(new NodeNotFoundError(uuid)));

		entry.markdown = content.markdown;
		if (content.searchMeta !== undefined) entry.searchMeta = content.searchMeta;
		if (content.searchBody !== undefined) entry.searchBody = content.searchBody;
		return Promise.resolve(right(undefined));
	}

	/** Keeps the in-memory `match` semantics: cleaned words, in order, no ranking (score 1). */
	fts(query: string, options: FtsOptions): Promise<Either<AntboxError, FtsResult>> {
		const { pageSize, pageToken } = options;
		const firstIndex = (pageToken - 1) * pageSize;
		const spec = NodesFilters.nodeSpecificationFrom(options.filters ?? []);

		const matches = Object.values(this.#data)
			.filter((entry) =>
				entry.searchMeta !== undefined &&
				fulltextMatches(query, [entry.searchMeta, entry.searchBody ?? ""]) &&
				spec.isSatisfiedBy(entry.node).isRight()
			)
			.map((entry) => entry.node)
			.sort((a, b) => a.title.localeCompare(b.title));

		const nodes = matches.slice(firstIndex, firstIndex + pageSize)
			.map((node) => this.#snapshot(node).right);
		const scores: Record<string, number> = Object.create(null);
		for (const node of nodes) scores[node.uuid] = 1;

		return Promise.resolve(right({ nodes, pageSize, pageToken, scores }));
	}

	listWithoutSearchContent(limit: number): Promise<Either<AntboxError, string[]>> {
		const uuids = Object.entries(this.#data)
			.filter(([, entry]) => entry.searchMeta === undefined)
			.slice(0, limit)
			.map(([uuid]) => uuid);
		return Promise.resolve(right(uuids));
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

	upsertEmbedding(uuid: string, embedding: Embedding): Promise<Either<AntboxError, void>> {
		const entry = this.#data[uuid];
		if (!entry) {
			return Promise.resolve(left(new BadRequestError(`Node ${uuid} not found`)));
		}

		try {
			entry.embedding = structuredClone(embedding);
		} catch (error) {
			return Promise.resolve(left(new UnknownError((error as Error).message)));
		}
		entry.status = "indexed";
		entry.statusError = undefined;
		entry.statusAt = new Date().toISOString();
		return Promise.resolve(right(undefined));
	}

	vectorSearch(
		queryVector: Embedding,
		topK: number,
		options: VectorSearchOptions = {},
	): Promise<Either<AntboxError, VectorSearchResult>> {
		const results: VectorSearchResult["nodes"] = [];
		const spec = NodesFilters.nodeSpecificationFrom(options.filters ?? []);

		for (const entry of Object.values(this.#data)) {
			if (entry.embedding && spec.isSatisfiedBy(entry.node).isRight()) {
				const score = this.#cosineSimilarity(queryVector, entry.embedding);
				results.push({
					node: entry.node,
					score,
					content: entry.markdown ?? "",
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
			entry.status = undefined;
			entry.statusError = undefined;
			entry.statusAt = undefined;
		}
		return Promise.resolve(right(undefined));
	}

	setEmbeddingStatus(
		uuid: string,
		status: "failed" | "skipped",
		error?: string,
	): Promise<Either<AntboxError, void>> {
		const entry = this.#data[uuid];
		if (!entry) return Promise.resolve(left(new NodeNotFoundError(uuid)));

		if (status === "skipped") entry.embedding = undefined;
		entry.status = status;
		entry.statusError = status === "failed" ? error : undefined;
		entry.statusAt = new Date().toISOString();
		return Promise.resolve(right(undefined));
	}

	getEmbeddingStatuses(
		uuids: string[],
	): Promise<Either<AntboxError, Record<string, EmbeddingStatusRecord>>> {
		const statuses: Record<string, EmbeddingStatusRecord> = Object.create(null);
		for (const uuid of uuids) {
			const entry = this.#data[uuid];
			if (!entry) continue;
			statuses[uuid] = {
				status: entry.status ?? null,
				...(entry.statusError ? { error: entry.statusError } : {}),
				...(entry.statusAt ? { at: entry.statusAt } : {}),
			};
		}
		return Promise.resolve(right(statuses));
	}

	countEmbeddingStatuses(): Promise<Either<AntboxError, EmbeddingStatusCounts>> {
		const counts: EmbeddingStatusCounts = { indexed: 0, failed: 0, skipped: 0, pending: 0 };
		for (const entry of Object.values(this.#data)) {
			counts[entry.status ?? "pending"]++;
		}
		return Promise.resolve(right(counts));
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
