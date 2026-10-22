import { type Filter, MongoClient, type ObjectId } from "mongodb";

import { type NodeLike } from "domain/node_like.ts";
import { NodeFactory } from "domain/node_factory.ts";
import type { Embedding } from "domain/nodes/embedding.ts";
import type { FilterOperator, NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import type {
	NodeFilterResult,
	NodeRepository,
	VectorSearchResult,
} from "domain/nodes/node_repository.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { isNodeFilters2D, type NodeFilter } from "domain/nodes/node_filter.ts";

type NodeDbModel = NodeMetadata & {
	_id: string | ObjectId;
	embedding?: Embedding;
	embeddingContentMd?: string;
};

/**
 * Builds a MongoDB-backed NodeRepository.
 *
 * @remarks
 * External setup:
 * - Start a MongoDB server and create a database/user with read/write access.
 * - Ensure the process can reach MongoDB (`--allow-net` in Deno).
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
		await client.db(dbname).collection(MongodbNodeRepository.COLLECTION_NAME)
			.createIndex({ uuid: 1 }, { unique: true });
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
			// deno-lint-ignore no-explicit-any
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
			// deno-lint-ignore no-explicit-any
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
			// deno-lint-ignore no-explicit-any
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

	async upsertEmbedding(
		uuid: string,
		embedding: Embedding,
		contentMd: string,
	): Promise<Either<AntboxError, void>> {
		try {
			await this.#collection.updateOne(
				{ uuid },
				{ $set: { embedding, embeddingContentMd: contentMd } },
			);
			return right(undefined);
		} catch (err) {
			// deno-lint-ignore no-explicit-any
			return left(new MongodbError((err as any).message));
		}
	}

	async vectorSearch(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult>> {
		try {
			const docs = await this.#collection
				.find({ embedding: { $exists: true } })
				.toArray();

			const results: VectorSearchResult["nodes"] = [];

			for (const doc of docs) {
				const dbDoc = doc as unknown as NodeDbModel;
				if (dbDoc.embedding) {
					const score = this.#cosineSimilarity(queryVector, dbDoc.embedding);
					const node = this.#toNodeLike(dbDoc);
					results.push({
						node,
						score,
						content: dbDoc.embeddingContentMd ?? "",
					});
				}
			}

			results.sort((a, b) => b.score - a.score);
			const topResults = results.slice(0, topK);

			return right({ nodes: topResults });
		} catch (err) {
			// deno-lint-ignore no-explicit-any
			return left(new MongodbError((err as any).message));
		}
	}

	async getEmbeddingContents(
		uuids: string[],
	): Promise<Either<AntboxError, Record<string, string>>> {
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
			// deno-lint-ignore no-explicit-any
			return left(new MongodbError((err as any).message));
		}
	}

	async deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			await this.#collection.updateOne(
				{ uuid },
				{ $unset: { embedding: "", embeddingContentMd: "" } },
			);
			return right(undefined);
		} catch (err) {
			// deno-lint-ignore no-explicit-any
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
			// deno-lint-ignore no-explicit-any
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
	if (field.startsWith("$")) return { $expr: false };
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
