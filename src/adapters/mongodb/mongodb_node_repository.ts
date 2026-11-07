import { type Filter, MongoClient, type ObjectId } from "mongodb";

import { type NodeLike } from "domain/node_like.ts";
import { NodeFactory } from "domain/node_factory.ts";
import type { Embedding } from "domain/nodes/embedding.ts";
import type { FilterOperator, NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
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
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { isNodeFilters2D, type NodeFilter } from "domain/nodes/node_filter.ts";
import { fulltextTerms, isFulltextFilter } from "domain/nodes/fulltext.ts";

type NodeDbModel = NodeMetadata & {
	_id: string | ObjectId;
	embedding?: Embedding;
	/** The node's markdown; the name predates full-text search. */
	embeddingContentMd?: string;
	searchMeta?: string;
	searchBody?: string;
	embeddingStatus?: EmbeddingStatus;
	embeddingError?: string;
	embeddingStatusAt?: string;
};

/**
 * Builds a MongoDB-backed NodeRepository.
 *
 * @remarks
 * External setup:
 * - Start a MongoDB server and create a database/user with read/write access.
 * - Ensure the process can reach MongoDB over the network.
 *
 * @example
 * const repoOrErr = await buildMongodbNodeRepository("mongodb://localhost:27017", "antbox");
 * if (repoOrErr.isRight()) {
 *   const repo = repoOrErr.value;
 * }
 */
export default async function buildMongodbNodeRepository(
	url: string,
	dbname: string,
): Promise<Either<AntboxError, NodeRepository>> {
	const client = new MongoClient(url);
	try {
		await client.connect();
		const collection = client.db(dbname).collection(MongodbNodeRepository.COLLECTION_NAME);
		await collection.createIndex({ uuid: 1 }, { unique: true });
		await collection.createIndex({ embeddingStatus: 1 });
		await collection.createIndex({ searchMeta: "text", searchBody: "text" }, {
			name: "nodes_fts",
			weights: { searchMeta: 10, searchBody: 1 },
			default_language: "portuguese",
			// A node field called "language" must not change the index language.
			language_override: "_ftsLanguage",
		});
		await collection.updateMany(
			{ embedding: { $exists: true }, embeddingStatus: { $exists: false } },
			{ $set: { embeddingStatus: "indexed" } },
		);
		return right(new MongodbNodeRepository(client, dbname));
	} catch (err) {
		await client.close();
		return left(new UnknownError((err as Error).message));
	}
}

export class MongodbNodeRepository implements NodeRepository {
	static readonly COLLECTION_NAME = "nodes";

	readonly #db: string;
	readonly #client: MongoClient;

	constructor(client: MongoClient, dbname: string) {
		this.#client = client;
		this.#db = dbname;
	}

	get #collection() {
		return this.#client.db(this.#db).collection<NodeDbModel>(
			MongodbNodeRepository.COLLECTION_NAME,
		);
	}

	add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>> {
		const doc = this.#fromNodeLike(node);

		return this.#collection
			.insertOne(doc)
			.then(() => right<DuplicatedNodeError, void>(undefined))
			.catch((err) => {
				if (err.code === 11000) {
					return left<DuplicatedNodeError, void>(new DuplicatedNodeError(node.uuid));
				}
				return left<DuplicatedNodeError, void>(new DuplicatedNodeError(node.uuid));
			});
	}

	async getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		try {
			const doc = await this.#collection.findOne({ uuid });

			if (!doc) {
				return left(new NodeNotFoundError(uuid));
			}

			return right(this.#toNodeLike(doc as NodeDbModel));
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}
	}

	async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const doc = await this.getById(uuid);

		if (doc.isLeft()) {
			return left(doc.value);
		}

		try {
			await this.#collection.deleteOne({ uuid });
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}

		return right(undefined);
	}

	async filter(
		filters: NodeFilters,
		pageSize = 20,
		pageToken = 1,
	): Promise<NodeFilterResult> {
		const query = buildMongoQuery(filters);

		const findCursor = await this.#collection.find(query, {
			limit: pageSize,
			skip: pageSize * (pageToken - 1),
		});

		const docs = await findCursor.toArray();

		const nodes = docs
			.map((d) => NodeFactory.from(d as unknown as NodeMetadata))
			.filter((result) => result.isRight())
			.map((result) => result.right);

		return {
			nodes,
			pageSize,
			pageToken,
		};
	}

	async getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		const result = await this.filter([["fid", "==", fid]], 1, 1);

		if (result.nodes.length === 0) {
			return left(new NodeNotFoundError(fid));
		}

		return right(result.nodes[0]);
	}

	async update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
		const doc = await this.getById(node.uuid);

		if (doc.isLeft()) {
			return left(doc.value);
		}

		try {
			const { _id, ...doc } = this.#fromNodeLike(node);
			await this.#collection.updateOne({ uuid: node.uuid }, {
				$set: doc,
			});
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}

		return right(undefined);
	}

	async touch(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			const result = await this.#collection.updateOne(
				{ uuid },
				{ $set: { modifiedTime: new Date().toISOString() } },
			);
			return result.matchedCount ? right(undefined) : left(new NodeNotFoundError(uuid));
		} catch (error) {
			return left(new MongodbError(error instanceof Error ? error.message : String(error)));
		}
	}

	supportsEmbeddings(): boolean {
		return true;
	}

	async saveContent(uuid: string, content: NodeContent): Promise<Either<AntboxError, void>> {
		try {
			const result = await this.#collection.updateOne({ uuid }, {
				$set: {
					embeddingContentMd: content.markdown,
					...(content.searchMeta === undefined ? {} : { searchMeta: content.searchMeta }),
					...(content.searchBody === undefined ? {} : { searchBody: content.searchBody }),
				},
			});
			return result.matchedCount ? right(undefined) : left(new NodeNotFoundError(uuid));
		} catch (err) {
			return left(new MongodbError((err as Error).message));
		}
	}

	/**
	 * $text query where every word is a quoted phrase, so all words are required and no $text
	 * operator (negation, phrases) in the text is ever interpreted. A document matches a word when
	 * one of its words has the same Portuguese stem and its text contains the query word, ignoring
	 * case and accents: "factura" finds "facturas" but "facturas" does not find "factura".
	 * Prefixes and parts of words do not match. Ranked by textScore (searchMeta weighs 10,
	 * searchBody 1), normalized to score / (score + 1).
	 */
	async fts(query: string, options: FtsOptions): Promise<Either<AntboxError, FtsResult>> {
		const { pageSize, pageToken } = options;
		const terms = fulltextTerms(query);
		if (terms.length === 0) return right({ nodes: [], pageSize, pageToken, scores: {} });

		try {
			const filters = options.filters ?? [];
			const docs = await this.#collection.find(
				{
					$text: { $search: terms.map((term) => `"${term}"`).join(" ") },
					...(filters.length ? { $and: [buildMongoQuery(filters)] } : {}),
				},
				{
					projection: {
						embedding: 0,
						embeddingContentMd: 0,
						searchBody: 0,
						searchMeta: 0,
						score: { $meta: "textScore" },
					},
					sort: { score: { $meta: "textScore" }, uuid: 1 },
					skip: pageSize * (pageToken - 1),
					limit: pageSize,
				},
			).toArray();

			const nodes: NodeLike[] = [];
			const scores: Record<string, number> = {};
			for (const doc of docs as unknown as Array<NodeDbModel & { score: number }>) {
				const { score, ...metadata } = doc;
				const nodeOrErr = NodeFactory.from(metadata as unknown as NodeMetadata);
				if (nodeOrErr.isLeft()) continue;
				nodes.push(nodeOrErr.value);
				scores[nodeOrErr.value.uuid] = score / (1 + score);
			}

			return right({ nodes, pageSize, pageToken, scores });
		} catch (err) {
			return left(new MongodbError((err as Error).message));
		}
	}

	async listWithoutSearchContent(limit: number): Promise<Either<AntboxError, string[]>> {
		try {
			const docs = await this.#collection.find(
				{ searchMeta: { $not: { $type: "string" } } },
				{ projection: { uuid: 1 }, sort: { uuid: 1 }, limit },
			).toArray();
			return right(docs.map((doc) => doc.uuid));
		} catch (err) {
			return left(new MongodbError((err as Error).message));
		}
	}

	async upsertEmbedding(uuid: string, embedding: Embedding): Promise<Either<AntboxError, void>> {
		try {
			await this.#collection.updateOne(
				{ uuid },
				{
					$set: {
						embedding,
						embeddingStatus: "indexed",
						embeddingStatusAt: new Date().toISOString(),
					},
					$unset: { embeddingError: "" },
				},
			);
			return right(undefined);
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}
	}

	async vectorSearch(
		queryVector: Embedding,
		topK: number,
		options: VectorSearchOptions = {},
	): Promise<Either<AntboxError, VectorSearchResult>> {
		try {
			// Scores are computed here: $vectorSearch only exists on Atlas. Content is loaded only
			// for the topK documents.
			const docs = await this.#collection
				.find(
					{ $and: [{ embedding: { $exists: true } }, buildMongoQuery(options.filters ?? [])] },
					{ projection: { embeddingContentMd: 0, searchMeta: 0, searchBody: 0 } },
				)
				.toArray();

			const scored = docs
				.map((doc) => doc as unknown as NodeDbModel)
				.filter((doc) => doc.embedding)
				.map((doc) => ({ doc, score: this.#cosineSimilarity(queryVector, doc.embedding!) }))
				.sort((a, b) => b.score - a.score)
				.slice(0, topK);

			const contents = await this.getContents(scored.map(({ doc }) => doc.uuid));
			if (contents.isLeft()) return left(contents.value);

			return right({
				nodes: scored.map(({ doc, score }) => ({
					node: this.#toNodeLike(doc),
					score,
					content: contents.value[doc.uuid] ?? "",
				})),
			});
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}
	}

	async getContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>> {
		if (uuids.length === 0) {
			return right({});
		}

		try {
			const docs = await this.#collection.find(
				{ uuid: { $in: uuids } },
				{ projection: { uuid: 1, embeddingContentMd: 1 } },
			).toArray();

			const contents: Record<string, string> = Object.create(null);
			for (const doc of docs) {
				const dbDoc = doc as unknown as NodeDbModel;
				if (
					typeof dbDoc.embeddingContentMd === "string" && dbDoc.embeddingContentMd.length > 0
				) {
					contents[dbDoc.uuid] = dbDoc.embeddingContentMd;
				}
			}

			return right(contents);
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}
	}

	async deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			await this.#collection.updateOne(
				{ uuid },
				{
					$unset: {
						embedding: "",
						embeddingStatus: "",
						embeddingError: "",
						embeddingStatusAt: "",
					},
				},
			);
			return right(undefined);
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}
	}

	async setEmbeddingStatus(
		uuid: string,
		status: "failed" | "skipped",
		error?: string,
	): Promise<Either<AntboxError, void>> {
		try {
			const at = new Date().toISOString();
			const result = status === "skipped"
				? await this.#collection.updateOne({ uuid }, {
					$set: { embeddingStatus: "skipped", embeddingStatusAt: at },
					$unset: { embedding: "", embeddingError: "" },
				})
				: await this.#collection.updateOne({ uuid }, {
					$set: {
						embeddingStatus: "failed",
						embeddingStatusAt: at,
						embeddingError: error ?? "",
					},
				});
			return result.matchedCount ? right(undefined) : left(new NodeNotFoundError(uuid));
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}
	}

	async getEmbeddingStatuses(
		uuids: string[],
	): Promise<Either<AntboxError, Record<string, EmbeddingStatusRecord>>> {
		if (uuids.length === 0) return right({});
		try {
			const docs = await this.#collection.find(
				{ uuid: { $in: uuids } },
				{
					projection: { uuid: 1, embeddingStatus: 1, embeddingError: 1, embeddingStatusAt: 1 },
				},
			).toArray();

			const statuses: Record<string, EmbeddingStatusRecord> = Object.create(null);
			for (const doc of docs as unknown as NodeDbModel[]) {
				statuses[doc.uuid] = {
					status: doc.embeddingStatus ?? null,
					...(doc.embeddingError ? { error: doc.embeddingError } : {}),
					...(doc.embeddingStatusAt ? { at: doc.embeddingStatusAt } : {}),
				};
			}
			return right(statuses);
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}
	}

	async countEmbeddingStatuses(): Promise<Either<AntboxError, EmbeddingStatusCounts>> {
		try {
			const groups = await this.#collection.aggregate<
				{ _id: EmbeddingStatus | null; n: number }
			>([
				{ $group: { _id: { $ifNull: ["$embeddingStatus", null] }, n: { $sum: 1 } } },
			]).toArray();
			const counts: EmbeddingStatusCounts = { indexed: 0, failed: 0, skipped: 0, pending: 0 };
			for (const group of groups) counts[group._id ?? "pending"] += group.n;
			return right(counts);
		} catch (err) {
			return left(new MongodbError((err as any).message));
		}
	}

	async aggregateTotalSize(): Promise<Either<AntboxError, number>> {
		try {
			const result = await this.#collection.aggregate([
				{
					$group: {
						_id: null,
						total: { $sum: "$size" },
					},
				},
			]).toArray();

			const total = result.length > 0 ? (result[0].total as number) : 0;
			return right(total);
		} catch (err) {
			return left(new MongodbError((err as any).message));
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

	async clear(): Promise<void> {
		await this.#collection.deleteMany({});
	}

	async close(): Promise<void> {
		await this.#client.close();
	}

	#fromNodeLike(node: NodeLike): NodeDbModel {
		return {
			_id: node.uuid,
			...node.metadata,
		};
	}

	#toNodeLike(doc: NodeDbModel): NodeLike {
		return NodeFactory.from(doc).right;
	}
}

export class MongodbError extends AntboxError {
	static ERROR_CODE = "MongodbError";
	constructor(message: string) {
		super(MongodbError.ERROR_CODE, message);
	}
}

function buildMongoQuery(filters: NodeFilters): Filter<NodeDbModel> {
	if (filters.length === 0) {
		return {};
	}

	const ofs = isNodeFilters2D(filters) ? filters : [filters];

	const ffs = ofs.map((ifs) => {
		const mfs = ifs.map(toMongoFilter);

		return mfs.length > 1 ? { $and: mfs } : (mfs[0] ?? {});
	});

	return ffs.length > 1 ? { $or: ffs } : ffs[0];
}

function toMongoFilter(filter: NodeFilter): Filter<NodeDbModel> {
	const [rawField, operator, value] = filter;
	const field = !rawField.startsWith("properties.") && rawField.includes(":")
		? `properties.${rawField}`
		: rawField;
	if (field.startsWith("$") || isFulltextFilter(filter)) return { $expr: false };
	if (
		([">", ">=", "<", "<="].includes(operator) &&
			typeof value !== "string" && typeof value !== "number") ||
		(operator === "match" && typeof value === "object" && value !== null)
	) return { $expr: false };
	if (Array.isArray(value) && value.length === 0) {
		if (operator === "in" || operator === "contains-any") return { $expr: false };
		if (operator === "not-in" || operator === "contains-all" || operator === "contains-none") {
			return {};
		}
	}
	const filterOperator = operatorMap[operator];
	return filterOperator([field, operator, value]);
}

const operatorMap: Record<FilterOperator, (f: NodeFilter) => Filter<NodeDbModel>> = {
	"==": ([f, _o, v]) => ({ [f]: { $eq: v } }),
	"!=": ([f, _o, v]) => ({ [f]: { $ne: v } }),
	">": ([f, _o, v]) => ({ [f]: { $gt: v } }),
	">=": ([f, _o, v]) => ({ [f]: { $gte: v } }),
	"<": ([f, _o, v]) => ({ [f]: { $lt: v } }),
	"<=": ([f, _o, v]) => ({ [f]: { $lte: v } }),
	in: ([f, _o, v]) => ({ $or: (v as unknown[]).map((value) => ({ [f]: { $eq: value } })) }),
	"not-in": ([f, _o, v]) => ({ $and: (v as unknown[]).map((value) => ({ [f]: { $ne: value } })) }),
	contains: ([f, _o, v]) => ({ [f]: { $eq: v } }),
	"not-contains": ([f, _o, v]) => ({ [f]: { $ne: v } }),
	"contains-all": ([f, _o, v]) => ({
		$and: (v as unknown[]).map((value) => ({ [f]: { $eq: value } })),
	}),
	"contains-none": ([f, _o, v]) => ({
		$and: (v as unknown[]).map((value) => ({ [f]: { $ne: value } })),
	}),
	match: ([f, _o, v]) => ({
		[f]: {
			// Anchor atomic groups so a missing later term cannot revisit earlier matches.
			$regex: "\\A" +
				String(v).trim().split(/\s+/).map((term) =>
					`(?>.*?${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\0", "\\x00")})`
				).join(""),
			$options: "is",
		},
	}),
	"contains-any": ([f, _o, v]) => ({
		$or: (v as unknown[]).map((value) => ({ [f]: { $eq: value } })),
	}),
};
