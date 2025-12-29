import { type BindValue, Database } from "jsr:@db/sqlite";

import { NodeFactory } from "domain/node_factory.ts";
import { Logger } from "shared/logger.ts";
import type { NodeLike } from "domain/node_like.ts";
import type { Embedding } from "domain/nodes/embedding.ts";
import {
	type FilterOperator,
	isNodeFilters2D,
	type NodeFilter,
	type NodeFilters,
} from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import type {
	NodeFilterResult,
	NodeRepository,
	VectorSearchResult,
} from "domain/nodes/node_repository.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export default function buildSqliteNodeRepository(
	baseFolder?: string,
): Promise<Either<AntboxError, NodeRepository>> {
	return Promise.resolve(right(new SqliteNodeRepository(baseFolder)));
}

export class SqliteError extends AntboxError {
	static ERROR_CODE = "SqliteError";
	constructor(message: string) {
		super(SqliteError.ERROR_CODE, message);
	}
}

export class SqliteNodeRepository implements NodeRepository {
	readonly #db: Database;

	constructor(baseFolder?: string) {
		if (baseFolder) {
			Deno.mkdirSync(baseFolder, { recursive: true });
			this.#db = new Database(`${baseFolder}/nodes.db`);
		} else {
			this.#db = new Database(":memory:");
		}

		this.#initialize();
	}

	#initialize(): void {
		this.#db.exec("PRAGMA journal_mode = WAL;");

		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS nodes (
				uuid TEXT PRIMARY KEY,
				fid TEXT GENERATED ALWAYS AS (json_extract(body, '$.fid')) STORED,
				title TEXT GENERATED ALWAYS AS (json_extract(body, '$.title')) STORED,
				parent TEXT GENERATED ALWAYS AS (json_extract(body, '$.parent')) STORED,
				mimetype TEXT GENERATED ALWAYS AS (json_extract(body, '$.mimetype')) STORED,
				body JSON NOT NULL,
				embedding JSON
			);
		`);

		this.#db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_fid ON nodes(fid);");
		this.#db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent);");
		this.#db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_mimetype ON nodes(mimetype);");

		this.#db.function("cosine_similarity", this.#cosineSimilarityFn);
	}

	#cosineSimilarityFn = (vectorAJson: string | null, vectorBJson: string | null): number => {
		if (!vectorAJson || !vectorBJson) {
			return 0;
		}

		try {
			const vectorA: number[] = JSON.parse(vectorAJson);
			const vectorB: number[] = JSON.parse(vectorBJson);

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
		} catch {
			return 0;
		}
	};

	supportsEmbeddings(): boolean {
		return true;
	}

	upsertEmbedding(uuid: string, embedding: Embedding): Promise<Either<AntboxError, void>> {
		try {
			const embeddingJson = JSON.stringify(embedding);
			this.#db.exec(
				"UPDATE nodes SET embedding = ? WHERE uuid = ?",
				[embeddingJson, uuid],
			);
			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteError(error.message)));
		}
	}

	async vectorSearch(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult>> {
		try {
			const queryVectorJson = JSON.stringify(queryVector);

			const rows = this.#db
				.prepare(
					`SELECT
						body,
						cosine_similarity(embedding, ?) as similarity
					 FROM nodes
					 WHERE embedding IS NOT NULL
					 ORDER BY similarity DESC
					 LIMIT ?`,
				)
				.all(queryVectorJson, topK) as {
					body: string;
					similarity: number;
				}[];

			const nodes: VectorSearchResult["nodes"] = [];

			for (const row of rows) {
				const metadata = JSON.parse(row.body) as NodeMetadata;
				const nodeResult = NodeFactory.from(metadata);

				if (nodeResult.isRight()) {
					nodes.push({
						node: nodeResult.right,
						score: row.similarity,
					});
				}
			}

			return right({ nodes });
		} catch (err) {
			const error = err as Error;
			return left(new SqliteError(error.message));
		}
	}

	deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			this.#db.exec("UPDATE nodes SET embedding = NULL WHERE uuid = ?", [uuid]);
			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteError(error.message)));
		}
	}

	add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>> {
		try {
			const body = JSON.stringify(node.metadata);
			this.#db.exec(
				"INSERT INTO nodes (uuid, body) VALUES (?, ?)",
				[node.uuid, body],
			);
			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			if (error.message.includes("UNIQUE constraint failed")) {
				return Promise.resolve(left(new DuplicatedNodeError(node.uuid)));
			}
			return Promise.resolve(left(new DuplicatedNodeError(node.uuid)));
		}
	}

	getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		try {
			const row = this.#db.prepare("SELECT body FROM nodes WHERE uuid = ?").get(uuid) as
				| { body: string }
				| undefined;

			if (!row) {
				return Promise.resolve(left(new NodeNotFoundError(uuid)));
			}

			const metadata = JSON.parse(row.body) as NodeMetadata;
			const nodeResult = NodeFactory.from(metadata);

			if (nodeResult.isLeft()) {
				return Promise.resolve(left(new NodeNotFoundError(uuid)));
			}

			return Promise.resolve(right(nodeResult.right));
		} catch (_err) {
			return Promise.resolve(left(new NodeNotFoundError(uuid)));
		}
	}

	getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		try {
			const row = this.#db.prepare("SELECT body FROM nodes WHERE fid = ?").get(fid) as
				| { body: string }
				| undefined;

			if (!row) {
				return Promise.resolve(left(new NodeNotFoundError(fid)));
			}

			const metadata = JSON.parse(row.body) as NodeMetadata;
			const nodeResult = NodeFactory.from(metadata);

			if (nodeResult.isLeft()) {
				return Promise.resolve(left(new NodeNotFoundError(fid)));
			}

			return Promise.resolve(right(nodeResult.right));
		} catch (_err) {
			return Promise.resolve(left(new NodeNotFoundError(fid)));
		}
	}

	async update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
		const existing = await this.getById(node.uuid);

		if (existing.isLeft()) {
			return left(existing.value);
		}

		try {
			const body = JSON.stringify(node.metadata);
			this.#db.exec(
				"UPDATE nodes SET body = ? WHERE uuid = ?",
				[body, node.uuid],
			);
			return right(undefined);
		} catch (_err) {
			return left(new NodeNotFoundError(node.uuid));
		}
	}

	async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const existing = await this.getById(uuid);

		if (existing.isLeft()) {
			return left(existing.value);
		}

		try {
			this.#db.exec("DELETE FROM nodes WHERE uuid = ?", [uuid]);
			return right(undefined);
		} catch (_err) {
			return left(new NodeNotFoundError(uuid));
		}
	}

	filter(
		filters: NodeFilters,
		pageSize = 20,
		pageToken = 1,
	): Promise<NodeFilterResult> {
		try {
			const offset = pageSize * (pageToken - 1);

			if (filters.length === 0) {
				return this.#findAll(pageSize, offset, pageToken);
			}

			const { sql, params } = this.#buildFilterQuery(filters, pageSize, offset);
			const rows = this.#db.prepare(sql).all(...params) as { body: string }[];

			const nodes = rows
				.map((row) => {
					const metadata: NodeMetadata = JSON.parse(row.body);
					return NodeFactory.from(metadata);
				})
				.filter((result) => result.isRight())
				.map((result) => result.right);

			return Promise.resolve({
				nodes,
				pageSize,
				pageToken,
			});
		} catch (err) {
			Logger.error("Filter error:", err);
			return Promise.resolve({
				nodes: [],
				pageSize,
				pageToken,
			});
		}
	}

	#findAll(
		pageSize: number,
		offset: number,
		pageToken: number,
	): Promise<NodeFilterResult> {
		const rows = this.#db
			.prepare("SELECT body FROM nodes LIMIT ? OFFSET ?")
			.all(pageSize, offset) as { body: string }[];

		const nodes = rows
			.map((row) => {
				const metadata = JSON.parse(row.body) as NodeMetadata;
				return NodeFactory.from(metadata);
			})
			.filter((result) => result.isRight())
			.map((result) => result.right);

		return Promise.resolve({
			nodes,
			pageSize,
			pageToken,
		});
	}

	#buildFilterQuery(
		filters: NodeFilters,
		pageSize: number,
		offset: number,
	): { sql: string; params: BindValue[] } {
		const params: BindValue[] = [];

		const orFilters = isNodeFilters2D(filters) ? filters : [filters];

		const orClauses = orFilters.map((andFilters) => {
			const andClauses = andFilters.map((filter) => {
				const clause = this.#filterToSql(filter, params);
				return clause;
			});

			return andClauses.length > 1 ? `(${andClauses.join(" AND ")})` : andClauses[0];
		});

		const whereClause = orClauses.length > 1 ? `(${orClauses.join(" OR ")})` : orClauses[0];

		params.push(pageSize, offset);

		return {
			sql: `SELECT body FROM nodes WHERE ${whereClause} LIMIT ? OFFSET ?`,
			params,
		};
	}

	#filterToSql(filter: NodeFilter, params: BindValue[]): string {
		const [field, operator, value] = filter;

		const promotedColumns = ["uuid", "fid", "title", "parent", "mimetype"];
		const columnRef = promotedColumns.includes(field)
			? field
			: `json_extract(body, '$.${field}')`;

		return operatorMap[operator](columnRef, value, params);
	}

	close(): void {
		this.#db.close();
	}
}

type SqlBuilder = (column: string, value: unknown, params: BindValue[]) => string;

const operatorMap: Record<FilterOperator, SqlBuilder> = {
	"==": (col, val, params) => {
		params.push(val as BindValue);
		return `${col} = ?`;
	},
	"!=": (col, val, params) => {
		params.push(val as BindValue);
		return `${col} != ?`;
	},
	">": (col, val, params) => {
		params.push(val as BindValue);
		return `${col} > ?`;
	},
	">=": (col, val, params) => {
		params.push(val as BindValue);
		return `${col} >= ?`;
	},
	"<": (col, val, params) => {
		params.push(val as BindValue);
		return `${col} < ?`;
	},
	"<=": (col, val, params) => {
		params.push(val as BindValue);
		return `${col} <= ?`;
	},
	in: (col, val, params) => {
		const values = val as BindValue[];
		const placeholders = values.map(() => "?").join(", ");
		params.push(...values);
		return `${col} IN (${placeholders})`;
	},
	"not-in": (col, val, params) => {
		const values = val as BindValue[];
		const placeholders = values.map(() => "?").join(", ");
		params.push(...values);
		return `${col} NOT IN (${placeholders})`;
	},
	match: (col, val, params) => {
		params.push(`%${val}%`);
		return `${col} LIKE ?`;
	},
	contains: (col, val, params) => {
		params.push(JSON.stringify(val));
		return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE json_each.value = json(?))`;
	},
	"not-contains": (col, val, params) => {
		params.push(JSON.stringify(val));
		return `NOT EXISTS (SELECT 1 FROM json_each(${col}) WHERE json_each.value = json(?))`;
	},
	"contains-all": (col, val, params) => {
		const values = [...(val as unknown[])];
		const conditions = values.map((v) => {
			params.push(JSON.stringify(v));
			return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE json_each.value = json(?))`;
		});
		return `(${conditions.join(" AND ")})`;
	},
	"contains-any": (col, val, params) => {
		const values = val as unknown[];
		const conditions = values.map((v) => {
			params.push(JSON.stringify(v));
			return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE json_each.value = json(?))`;
		});
		return `(${conditions.join(" OR ")})`;
	},
	"contains-none": (col, val, params) => {
		const values = val as unknown[];
		const conditions = values.map((v) => {
			params.push(JSON.stringify(v));
			return `NOT EXISTS (SELECT 1 FROM json_each(${col}) WHERE json_each.value = json(?))`;
		});
		return `(${conditions.join(" AND ")})`;
	},
};
