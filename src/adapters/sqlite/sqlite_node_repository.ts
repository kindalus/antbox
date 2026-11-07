import fsSync from "node:fs";
import process from "node:process";
import { DatabaseSync } from "node:sqlite";
import { getLoadablePath } from "sqlite-vec";

import { type BindValue, toSqlValue, toSqlValues } from "./bind.ts";

import { NodeFactory } from "domain/node_factory.ts";
import { Logger } from "shared/logger.ts";
import type { NodeLike } from "domain/node_like.ts";
import type { Embedding } from "domain/nodes/embedding.ts";
import {
	type FilterOperator,
	isNodeFilters2D,
	type NodeFilter,
	type NodeFilters,
	type NodeFilters2D,
} from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import type {
	EmbeddingStatus,
	EmbeddingStatusCounts,
	EmbeddingStatusRecord,
	NodeFilterResult,
	NodeRepository,
	VectorSearchOptions,
	VectorSearchResult,
} from "domain/nodes/node_repository.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

/**
 * Builds a SQLite-backed NodeRepository.
 *
 * @remarks
 * External setup:
 * - For persistent storage, pass `baseFolder` and ensure it is writable.
 * - The process needs read and write access to the data path.
 *
 * @example
 * const repoOrErr = await buildSqliteNodeRepository("/var/lib/antbox");
 * if (repoOrErr.isRight()) {
 *   const repo = repoOrErr.value;
 * }
 */
export default function buildSqliteNodeRepository(
	baseFolder?: string,
): Promise<Either<AntboxError, NodeRepository>> {
	try {
		return Promise.resolve(right(new SqliteNodeRepository(baseFolder)));
	} catch (error) {
		return Promise.resolve(
			left(new SqliteError(error instanceof Error ? error.message : String(error))),
		);
	}
}

export class SqliteError extends AntboxError {
	static ERROR_CODE = "SqliteError";
	constructor(message: string) {
		super(SqliteError.ERROR_CODE, message);
	}
}

/**
 * SQLite NodeRepository. Embeddings are float32 BLOBs compared with the sqlite-vec extension by
 * brute force, so filters apply before the topK cut.
 *
 * @throws when the sqlite-vec extension cannot be loaded for this platform.
 */
export class SqliteNodeRepository implements NodeRepository {
	readonly #db: DatabaseSync;

	constructor(baseFolder?: string) {
		const path = baseFolder ? `${baseFolder}/nodes.db` : ":memory:";
		if (baseFolder) fsSync.mkdirSync(baseFolder, { recursive: true });
		this.#db = new DatabaseSync(path, { allowExtension: true });

		try {
			this.#db.loadExtension(getLoadablePath());
		} catch (error) {
			this.#db.close();
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(
				`SqliteNodeRepository: cannot load the sqlite-vec extension for ` +
					`${process.platform}-${process.arch} (${reason}). ` +
					"Install the dependencies with the optional package for this platform.",
			);
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
				embedding JSON,
				embedding_content_md TEXT
			);
		`);

		this.#ensureColumns();
		this.#migrateJsonEmbeddings();
		this.#db.exec(
			"UPDATE nodes SET embedding_status = 'indexed' WHERE embedding IS NOT NULL AND embedding_status IS NULL",
		);

		this.#db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_fid ON nodes(fid);");
		this.#db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent);");
		this.#db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_mimetype ON nodes(mimetype);");
		this.#db.exec(
			"CREATE INDEX IF NOT EXISTS idx_nodes_embedding_status ON nodes(embedding_status);",
		);
	}

	#ensureColumns(): void {
		const columns = new Set(
			(this.#db.prepare("PRAGMA table_info(nodes)").all() as Array<{ name: string }>)
				.map((column) => column.name),
		);

		for (
			const column of [
				"embedding_content_md",
				"embedding_status",
				"embedding_error",
				"embedding_status_at",
			]
		) {
			if (!columns.has(column)) this.#db.exec(`ALTER TABLE nodes ADD COLUMN ${column} TEXT`);
		}
	}

	/** Converts embeddings stored as JSON text by earlier versions into float32 BLOBs. */
	#migrateJsonEmbeddings(): void {
		try {
			this.#db.exec(
				"UPDATE nodes SET embedding = vec_f32(embedding) WHERE typeof(embedding) = 'text'",
			);
			return;
		} catch (error) {
			Logger.warn("SqliteNodeRepository: converting embeddings one by one", error);
		}

		const rows = this.#db.prepare(
			"SELECT uuid FROM nodes WHERE typeof(embedding) = 'text'",
		).all() as { uuid: string }[];
		const convert = this.#db.prepare(
			"UPDATE nodes SET embedding = vec_f32(embedding) WHERE uuid = ?",
		);
		const discard = this.#db.prepare(
			"UPDATE nodes SET embedding = NULL, embedding_status = NULL WHERE uuid = ?",
		);
		for (const { uuid } of rows) {
			try {
				convert.run(uuid);
			} catch {
				Logger.warn(`SqliteNodeRepository: discarding unreadable embedding of ${uuid}`);
				discard.run(uuid);
			}
		}
	}

	supportsEmbeddings(): boolean {
		return true;
	}

	upsertEmbedding(
		uuid: string,
		embedding: Embedding,
		contentMd: string,
	): Promise<Either<AntboxError, void>> {
		try {
			this.#db.prepare(
				`UPDATE nodes SET embedding = vec_f32(?), embedding_content_md = ?,
					embedding_status = 'indexed', embedding_error = NULL, embedding_status_at = ?
				WHERE uuid = ?`,
			).run(JSON.stringify(embedding), contentMd, new Date().toISOString(), uuid);
			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteError(error.message)));
		}
	}

	vectorSearch(
		queryVector: Embedding,
		topK: number,
		options: VectorSearchOptions = {},
	): Promise<Either<AntboxError, VectorSearchResult>> {
		try {
			const params: BindValue[] = [JSON.stringify(queryVector), queryVector.length];
			const filters = options.filters ?? [];
			const where = filters.length ? ` AND ${this.#whereClause(filters, params)}` : "";
			params.push(topK);

			const rows = this.#db
				.prepare(
					`SELECT
						body,
						embedding_content_md,
						COALESCE(1 - vec_distance_cosine(embedding, vec_f32(?)), 0) AS score
					 FROM nodes
					 WHERE embedding IS NOT NULL AND vec_length(embedding) = ?${where}
					 ORDER BY score DESC
					 LIMIT ?`,
				)
				.all(...toSqlValues(params)) as {
					body: string;
					embedding_content_md: string | null;
					score: number;
				}[];

			const nodes: VectorSearchResult["nodes"] = [];

			for (const row of rows) {
				const nodeResult = NodeFactory.from(JSON.parse(row.body) as NodeMetadata);
				if (nodeResult.isRight()) {
					nodes.push({
						node: nodeResult.right,
						score: row.score,
						content: row.embedding_content_md ?? "",
					});
				}
			}

			return Promise.resolve(right({ nodes }));
		} catch (err) {
			return Promise.resolve(left(new SqliteError((err as Error).message)));
		}
	}

	deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			this.#db.prepare(
				`UPDATE nodes SET embedding = NULL, embedding_content_md = NULL, embedding_status = NULL,
					embedding_error = NULL, embedding_status_at = NULL
				WHERE uuid = ?`,
			).run(uuid);
			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteError(error.message)));
		}
	}

	setEmbeddingStatus(
		uuid: string,
		status: "failed" | "skipped",
		error?: string,
	): Promise<Either<AntboxError, void>> {
		try {
			const at = new Date().toISOString();
			const row = status === "skipped"
				? this.#db.prepare(
					`UPDATE nodes SET embedding = NULL, embedding_content_md = NULL,
						embedding_status = 'skipped', embedding_error = NULL, embedding_status_at = ?
					WHERE uuid = ? RETURNING uuid`,
				).get(at, uuid)
				: this.#db.prepare(
					`UPDATE nodes SET embedding_status = 'failed', embedding_error = ?,
						embedding_status_at = ?
					WHERE uuid = ? RETURNING uuid`,
				).get(error ?? null, at, uuid);
			return Promise.resolve(row ? right(undefined) : left(new NodeNotFoundError(uuid)));
		} catch (err) {
			return Promise.resolve(left(new SqliteError((err as Error).message)));
		}
	}

	getEmbeddingStatuses(
		uuids: string[],
	): Promise<Either<AntboxError, Record<string, EmbeddingStatusRecord>>> {
		if (uuids.length === 0) return Promise.resolve(right({}));
		try {
			const placeholders = uuids.map(() => "?").join(", ");
			const rows = this.#db.prepare(
				`SELECT uuid, embedding_status, embedding_error, embedding_status_at
				FROM nodes WHERE uuid IN (${placeholders})`,
			).all(...uuids) as {
				uuid: string;
				embedding_status: EmbeddingStatus | null;
				embedding_error: string | null;
				embedding_status_at: string | null;
			}[];

			const statuses: Record<string, EmbeddingStatusRecord> = {};
			for (const row of rows) {
				statuses[row.uuid] = {
					status: row.embedding_status,
					...(row.embedding_error ? { error: row.embedding_error } : {}),
					...(row.embedding_status_at ? { at: row.embedding_status_at } : {}),
				};
			}
			return Promise.resolve(right(statuses));
		} catch (err) {
			return Promise.resolve(left(new SqliteError((err as Error).message)));
		}
	}

	countEmbeddingStatuses(): Promise<Either<AntboxError, EmbeddingStatusCounts>> {
		try {
			const rows = this.#db.prepare(
				"SELECT embedding_status AS status, count(*) AS n FROM nodes GROUP BY embedding_status",
			).all() as { status: EmbeddingStatus | null; n: number }[];

			const counts: EmbeddingStatusCounts = { indexed: 0, failed: 0, skipped: 0, pending: 0 };
			for (const row of rows) counts[row.status ?? "pending"] += Number(row.n);
			return Promise.resolve(right(counts));
		} catch (err) {
			return Promise.resolve(left(new SqliteError((err as Error).message)));
		}
	}

	aggregateTotalSize(): Promise<Either<AntboxError, number>> {
		try {
			// json_extract extracts the size property.
			const rows = this.#db
				.prepare("SELECT SUM(json_extract(body, '$.size')) as total FROM nodes")
				.all() as { total: number | null }[];

			const total = rows[0]?.total ?? 0;
			return Promise.resolve(right(total));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteError(error.message)));
		}
	}

	add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>> {
		try {
			const body = JSON.stringify(node.metadata);
			this.#db.prepare("INSERT INTO nodes (uuid, body) VALUES (?, ?)").run(node.uuid, body);
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

	getEmbeddingContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>> {
		if (uuids.length === 0) {
			return Promise.resolve(right({}));
		}

		try {
			const placeholders = uuids.map(() => "?").join(", ");
			const rows = this.#db.prepare(
				`SELECT uuid, embedding_content_md FROM nodes WHERE uuid IN (${placeholders})`,
			).all(...uuids) as Array<{
				uuid: string;
				embedding_content_md: string | null;
			}>;

			const contents: Record<string, string> = {};
			for (const row of rows) {
				if (
					typeof row.embedding_content_md === "string" && row.embedding_content_md.length > 0
				) {
					contents[row.uuid] = row.embedding_content_md;
				}
			}

			return Promise.resolve(right(contents));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteError(error.message)));
		}
	}

	async update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
		const existing = await this.getById(node.uuid);

		if (existing.isLeft()) {
			return left(existing.value);
		}

		try {
			const body = JSON.stringify(node.metadata);
			this.#db.prepare("UPDATE nodes SET body = ? WHERE uuid = ?").run(body, node.uuid);
			return right(undefined);
		} catch (_err) {
			return left(new NodeNotFoundError(node.uuid));
		}
	}

	async touch(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			const row = this.#db.prepare(
				"UPDATE nodes SET body = json_set(body, '$.modifiedTime', ?) WHERE uuid = ? RETURNING uuid",
			).get(new Date().toISOString(), uuid);
			return row ? right(undefined) : left(new NodeNotFoundError(uuid));
		} catch (error) {
			return left(new SqliteError(error instanceof Error ? error.message : String(error)));
		}
	}

	async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const existing = await this.getById(uuid);

		if (existing.isLeft()) {
			return left(existing.value);
		}

		try {
			this.#db.prepare("DELETE FROM nodes WHERE uuid = ?").run(uuid);
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
			const rows = this.#db.prepare(sql).all(...toSqlValues(params)) as { body: string }[];

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
			.all(toSqlValue(pageSize), toSqlValue(offset)) as { body: string }[];

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
		const whereClause = this.#whereClause(filters, params);
		params.push(pageSize, offset);

		return {
			sql: `SELECT body FROM nodes WHERE ${whereClause} LIMIT ? OFFSET ?`,
			params,
		};
	}

	/** SQL condition for the filters; its bind values are appended to params in order. */
	#whereClause(filters: NodeFilters | NodeFilters2D, params: BindValue[]): string {
		const orFilters = isNodeFilters2D(filters) ? filters : [filters];

		const orClauses = orFilters.map((andFilters) => {
			const andClauses = andFilters.map((filter) => {
				const clause = this.#filterToSql(filter, params);
				return clause;
			});

			return andClauses.length > 1 ? `(${andClauses.join(" AND ")})` : (andClauses[0] ?? "TRUE");
		});

		return orClauses.length > 1 ? `(${orClauses.join(" OR ")})` : (orClauses[0] ?? "TRUE");
	}

	#filterToSql(filter: NodeFilter, params: BindValue[]): string {
		const [rawField, operator, value] = filter;
		const field = normalizeFieldName(rawField);
		if (
			([">", ">=", "<", "<="].includes(operator) &&
				typeof value !== "string" && typeof value !== "number") ||
			(operator === "match" && typeof value === "object" && value !== null)
		) return "FALSE";
		if (Array.isArray(value) && value.length === 0) {
			if (operator === "in" || operator === "contains-any") return "FALSE";
			if (
				operator === "not-in" || operator === "contains-all" || operator === "contains-none"
			) return "TRUE";
		}

		const promotedColumns = ["uuid", "fid", "title", "parent", "mimetype"];
		const columnRef = promotedColumns.includes(field)
			? field
			: `json_extract(body, ?${params.push(`$.${field}`)})`;

		return operatorMap[operator](columnRef, value, params);
	}

	close(): void {
		this.#db.close();
	}
}

type SqlBuilder = (column: string, value: unknown, params: BindValue[]) => string;

function buildJsonEachEqualsClause(value: unknown, params: BindValue[]): string {
	if (value !== null && typeof value === "object") {
		params.push(JSON.stringify(value));
		return `json_each.value = json(?)`;
	}

	params.push(value as BindValue);
	return `json_each.atom = ?`;
}

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
		const pattern = String(val).trim().replaceAll(/[\\%_]/g, "\\$&").replaceAll(/\s+/g, "%");
		params.push(`%${pattern}%`);
		return `${col} LIKE ? ESCAPE '\\'`;
	},
	contains: (col, val, params) => {
		const comparison = buildJsonEachEqualsClause(val, params);
		return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE ${comparison})`;
	},
	"not-contains": (col, val, params) => {
		const comparison = buildJsonEachEqualsClause(val, params);
		return `NOT EXISTS (SELECT 1 FROM json_each(${col}) WHERE ${comparison})`;
	},
	"contains-all": (col, val, params) => {
		const values = [...(val as unknown[])];
		const conditions = values.map((v) => {
			const comparison = buildJsonEachEqualsClause(v, params);
			return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE ${comparison})`;
		});
		return `(${conditions.join(" AND ")})`;
	},
	"contains-any": (col, val, params) => {
		const values = val as unknown[];
		const conditions = values.map((v) => {
			const comparison = buildJsonEachEqualsClause(v, params);
			return `EXISTS (SELECT 1 FROM json_each(${col}) WHERE ${comparison})`;
		});
		return `(${conditions.join(" OR ")})`;
	},
	"contains-none": (col, val, params) => {
		const values = val as unknown[];
		const conditions = values.map((v) => {
			const comparison = buildJsonEachEqualsClause(v, params);
			return `NOT EXISTS (SELECT 1 FROM json_each(${col}) WHERE ${comparison})`;
		});
		return `(${conditions.join(" AND ")})`;
	},
};

function normalizeFieldName(field: string): string {
	if (!field.startsWith("properties.") && field.includes(":")) {
		return `properties.${field}`;
	}
	return field;
}
