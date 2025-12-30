import { type Document, type Filter, MongoClient, ObjectId } from "mongodb";

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

type NodeDbModel = NodeMetadata & { _id: ObjectId; embedding?: Embedding };

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
export default function buildMongodbNodeRepository(
	url: string,
	dbname: string,
): Promise<Either<AntboxError, NodeRepository>> {
	return new MongoClient(url)
		.connect()
		.then((client) => new MongodbNodeRepository(client, dbname))
		.then((repo) => right(repo))
		.catch((err) => left(new UnknownError(err.message))) as Promise<
			Either<AntboxError, NodeRepository>
		>;
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
		return this.#client.db(this.#db).collection(
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
			const doc = await this.#collection.findOne({ _id: toObjectId(uuid) });

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
			await this.#collection.deleteOne({ _id: toObjectId(uuid) });
		} catch (err) {
			// deno-lint-ignore no-explicit-any
			return left(new MongodbError((err as any).message));
		}

		return right(undefined);
	}

	async filter(
		filters: NodeFilters,
		pageSize: number,
		pageToken: number,
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
			await this.#collection.updateOne({ _id: toObjectId(node.uuid) }, {
				$set: doc,
			});
		} catch (err) {
			// deno-lint-ignore no-explicit-any
			return left(new MongodbError((err as any).message));
		}

		return right(undefined);
	}

	supportsEmbeddings(): boolean {
		return true;
	}

	async upsertEmbedding(uuid: string, embedding: Embedding): Promise<Either<AntboxError, void>> {
		try {
			await this.#collection.updateOne(
				{ _id: toObjectId(uuid) },
				{ $set: { embedding } },
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

			const results: Array<{ node: NodeLike; score: number }> = [];

			for (const doc of docs) {
				const dbDoc = doc as unknown as NodeDbModel;
				if (dbDoc.embedding) {
					const score = this.#cosineSimilarity(queryVector, dbDoc.embedding);
					const node = this.#toNodeLike(dbDoc);
					results.push({ node, score });
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

	async deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			await this.#collection.updateOne(
				{ _id: toObjectId(uuid) },
				{ $unset: { embedding: "" } },
			);
			return right(undefined);
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
			_id: toObjectId(node.uuid),
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

export function toObjectId(uuid: string): ObjectId {
	let hex = 0;
	for (const i of uuid) {
		hex = (hex << 8) | i.charCodeAt(0);
	}

	return ObjectId.createFromTime(hex);
}

function buildMongoQuery(filters: NodeFilters): Filter<Document> {
	if (filters.length === 0) {
		return {};
	}

	const ofs = isNodeFilters2D(filters) ? filters : [filters];

	const ffs = ofs.map((ifs) => {
		const mfs = ifs.map(toMongoFilter);

		return mfs.length > 1 ? { $and: mfs } : mfs[0];
	});

	return ffs.length > 1 ? { $or: ffs } : ffs[0];
}

function toMongoFilter(filter: NodeFilter): Filter<Document> {
	const [field, operator, value] = filter;
	const filterOperator = operatorMap[operator];
	return filterOperator([field, operator, value]);
}

const operatorMap: Record<FilterOperator, (f: NodeFilter) => Filter<Document>> = {
	"==": ([f, _o, v]) => ({ [f]: v }),
	"!=": ([f, _o, v]) => ({ [f]: { $ne: v } }),
	">": ([f, _o, v]) => ({ [f]: { $gt: v } }),
	">=": ([f, _o, v]) => ({ [f]: { $gte: v } }),
	"<": ([f, _o, v]) => ({ [f]: { $lt: v } }),
	"<=": ([f, _o, v]) => ({ [f]: { $lte: v } }),
	in: ([f, _o, v]) => ({ [f]: { $in: v } }),
	"not-in": ([f, _o, v]) => ({ [f]: { $nin: v } }),
	contains: ([f, _o, v]) => ({ [f]: { $all: [v] } }),
	"not-contains": ([f, _o, v]) => ({ [f]: { $not: { $all: [v] } } }),
	"contains-all": ([f, _o, v]) => ({ [f]: { $all: v } }),
	"contains-none": ([f, _o, v]) => ({ [f]: { $not: { $all: v } } }),
	match: ([f, _o, v]) => ({ [f]: { $regex: v } }),
	"contains-any": ([f, _o, v]) => {
		const values = v as string[];
		const condition = values.map((v) => ({ [f]: v }));

		return { $or: condition };
	},
};
