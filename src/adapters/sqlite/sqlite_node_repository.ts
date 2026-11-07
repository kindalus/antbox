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
import { fulltextTerms, isFulltextFilter } from "domain/nodes/fulltext.ts";
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

		this.#initializeSearch();

		this.#db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_fid ON nodes(fid);");
		this.#db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent);");
		this.#db.exec("CREATE INDEX IF NOT EXISTS idx_nodes_mimetype ON nodes(mimetype);");
		this.#db.exec(
			"CREATE INDEX IF NOT EXISTS idx_nodes_embedding_status ON nodes(embedding_status);",
		);
	}

	/**
	 * Full-text search: nodes_search holds the text and nodes_fts is an FTS5 index over it. The
	 * INTEGER PRIMARY KEY gives the index a rowid that VACUUM keeps. Triggers keep the index in step
	 * with nodes_search and remove the search row with its node. A node without a nodes_search row,
	 * or with a NULL search_meta, has not been migrated yet.
	 */
	#initializeSearch(): void {
		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS nodes_search (
				id INTEGER PRIMARY KEY,
				uuid TEXT NOT NULL UNIQUE,
				search_meta TEXT,
				search_body TEXT NOT NULL DEFAULT ''
			);

			CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
				search_meta,
				search_body,
				content = 'nodes_search',
				content_rowid = 'id',
				tokenize = 'unicode61 remove_diacritics 2'
			);

			CREATE TRIGGER IF NOT EXISTS nodes_search_after_insert AFTER INSERT ON nodes_search BEGIN
				INSERT INTO nodes_fts (rowid, search_meta, search_body)
				VALUES (new.id, new.search_meta, new.search_body);
			END;

			CREATE TRIGGER IF NOT EXISTS nodes_search_after_delete AFTER DELETE ON nodes_search BEGIN
				INSERT INTO nodes_fts (nodes_fts, rowid, search_meta, search_body)
				VALUES ('delete', old.id, old.search_meta, old.search_body);
			END;

			CREATE TRIGGER IF NOT EXISTS nodes_search_after_update AFTER UPDATE ON nodes_search BEGIN
				INSERT INTO nodes_fts (nodes_fts, rowid, search_meta, search_body)
				VALUES ('delete', old.id, old.search_meta, old.search_body);
				INSERT INTO nodes_fts (rowid, search_meta, search_body)
				VALUES (new.id, new.search_meta, new.search_body);
			END;

			CREATE TRIGGER IF NOT EXISTS nodes_after_delete_search AFTER DELETE ON nodes BEGIN
				DELETE FROM nodes_search WHERE uuid = old.uuid;
			END;
		`);
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

	upsertEmbedding(uuid: string, embedding: Embedding): Promise<Either<AntboxError, void>> {
		try {
			this.#db.prepare(
				`UPDATE nodes SET embedding = vec_f32(?),
					embedding_status = 'indexed', embedding_error = NULL, embedding_status_at = ?
				WHERE uuid = ?`,
			).run(JSON.stringify(embedding), new Date().toISOString(), uuid);
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
				`UPDATE nodes SET embedding = NULL, embedding_status = NULL,
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
					`UPDATE nodes SET embedding = NULL,
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

	saveContent(uuid: string, content: NodeContent): Promise<Either<AntboxError, void>> {
		try {
			this.#db.exec("BEGIN IMMEDIATE");
			try {
				const row = this.#db.prepare(
					"UPDATE nodes SET embedding_content_md = ? WHERE uuid = ? RETURNING uuid",
				).get(content.markdown, uuid);
				if (!row) {
					this.#db.exec("ROLLBACK");
					return Promise.resolve(left(new NodeNotFoundError(uuid)));
				}

				const updates: string[] = [];
				if (content.searchMeta !== undefined) {
					updates.push("search_meta = excluded.search_meta");
				}
				if (content.searchBody !== undefined) {
					updates.push("search_body = excluded.search_body");
				}
				this.#db.prepare(
					`INSERT INTO nodes_search (uuid, search_meta, search_body) VALUES (?, ?, ?)
					ON CONFLICT (uuid) DO ${
						updates.length ? `UPDATE SET ${updates.join(", ")}` : "NOTHING"
					}`,
				).run(uuid, content.searchMeta ?? null, content.searchBody ?? "");

				this.#db.exec("COMMIT");
			} catch (error) {
				this.#db.exec("ROLLBACK");
				throw error;
			}
			return Promise.resolve(right(undefined));
		} catch (err) {
			return Promise.resolve(left(new SqliteError((err as Error).message)));
		}
	}

	/**
	 * FTS5 query: every word is a quoted prefix phrase, so all words are required, each matches the
	 * start of a token, and no FTS5 operator in the text is ever interpreted. Ranked by bm25 with
	 * searchMeta weighted 10 and searchBody 1; the score is -bm25 / (1 - bm25), in [0, 1).
	 */
	fts(query: string, options: FtsOptions): Promise<Either<AntboxError, FtsResult>> {
		const { pageSize, pageToken } = options;
		const empty = { nodes: [], pageSize, pageToken, scores: {} };
		const terms = fulltextTerms(query);
		if (terms.length === 0) return Promise.resolve(right(empty));

		try {
			const params: BindValue[] = [terms.map((term) => `"${term}"*`).join(" ")];
			const filters = options.filters ?? [];
			const where = filters.length ? `WHERE ${this.#whereClause(filters, params)}` : "";
			params.push(pageSize, pageSize * (pageToken - 1));

			const rows = this.#db.prepare(
				`SELECT nodes.body AS body, matches.rank AS rank
				FROM nodes
				JOIN (
					SELECT nodes_search.uuid AS match_uuid, -bm25(nodes_fts, 10.0, 1.0) AS rank
					FROM nodes_fts JOIN nodes_search ON nodes_search.id = nodes_fts.rowid
					WHERE nodes_fts MATCH ?
				) AS matches ON matches.match_uuid = nodes.uuid
				${where}
				ORDER BY matches.rank DESC, nodes.uuid
				LIMIT ? OFFSET ?`,
			).all(...toSqlValues(params)) as { body: string; rank: number }[];

			const nodes: NodeLike[] = [];
			const scores: Record<string, number> = {};
			for (const row of rows) {
				const nodeOrErr = NodeFactory.from(JSON.parse(row.body) as NodeMetadata);
				if (nodeOrErr.isLeft()) continue;
				const rank = Math.max(0, Number(row.rank));
				nodes.push(nodeOrErr.value);
				scores[nodeOrErr.value.uuid] = rank / (1 + rank);
			}

			return Promise.resolve(right({ nodes, pageSize, pageToken, scores }));
		} catch (err) {
			return Promise.resolve(left(new SqliteError((err as Error).message)));
		}
	}

	listWithoutSearchContent(limit: number): Promise<Either<AntboxError, string[]>> {
		try {
			const rows = this.#db.prepare(
				`SELECT uuid FROM nodes
				WHERE uuid NOT IN (SELECT uuid FROM nodes_search WHERE search_meta IS NOT NULL)
				ORDER BY uuid
				LIMIT ?`,
			).all(toSqlValue(limit)) as { uuid: string }[];
			return Promise.resolve(right(rows.map((row) => row.uuid)));
		} catch (err) {
			return Promise.resolve(left(new SqliteError((err as Error).message)));
		}
	}

	getContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>> {
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

	countMatching(filters: NodeFilters): Promise<Either<AntboxError, number>> {
		try {
			const params: BindValue[] = [];
			const where = filters.length === 0 ? "TRUE" : this.#whereClause(filters, params);
			const row = this.#db
				.prepare(`SELECT COUNT(*) AS total FROM nodes WHERE ${where}`)
				.get(...toSqlValues(params)) as { total: number | bigint };
			return Promise.resolve(right(Number(row.total)));
		} catch (err) {
			Logger.error("Count error:", err);
			return Promise.resolve(left(new SqliteError(String(err))));
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
		if (isFulltextFilter(filter)) return "FALSE";
		if (
			([">", ">=", "<", "<="].includes(operator) &&
				typeof value !== "string" && typeof value !== "number") ||
			(operator === "match" && typeof value === "object" && value !== null)
		) return "FALSE";
		if (Array.isArray(value) && value.length === 0) {
			if (operator === "in" || operator === "contains-any") return "FALSE";
			if (operator === "not-in" || operator === "contains-none") return "TRUE";
		}

		if (isContainsOperator(operator)) {
			// Read from the body even for promoted columns, which are never arrays.
			return containsToSql(operator, `?${params.push(`$.${field}`)}`, value, params);
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

type ContainsOperator =
	| "contains"
	| "not-contains"
	| "contains-all"
	| "contains-any"
	| "contains-none";

function isContainsOperator(operator: FilterOperator): operator is ContainsOperator {
	return operator === "contains" || operator === "not-contains" || operator === "contains-all" ||
		operator === "contains-any" || operator === "contains-none";
}

/**
 * The contains family applies only to arrays: a value that is not a JSON array contains nothing,
 * so it never satisfies contains, contains-all or contains-any and always satisfies not-contains
 * and contains-none. `path` is the bind placeholder of the JSON path.
 */
function containsToSql(
	operator: ContainsOperator,
	path: string,
	value: unknown,
	params: BindValue[],
): string {
	// IS keeps a missing path (NULL json_type) false rather than NULL, so NOT (...) stays true.
	const isArray = `json_type(body, ${path}) IS 'array'`;
	const has = (target: unknown) =>
		`EXISTS (SELECT 1 FROM json_each(body, ${path}) WHERE ${
			buildJsonEachEqualsClause(target, params)
		})`;
	const values = Array.isArray(value) ? value : [value];

	switch (operator) {
		case "contains":
			return `(${isArray} AND ${has(value)})`;
		case "not-contains":
			return `NOT (${isArray} AND ${has(value)})`;
		case "contains-all":
			return `(${[isArray, ...values.map(has)].join(" AND ")})`;
		case "contains-any":
			return `(${isArray} AND (${values.map(has).join(" OR ")}))`;
		case "contains-none":
			return `NOT (${isArray} AND (${values.map(has).join(" OR ")}))`;
	}
}

const operatorMap: Record<Exclude<FilterOperator, ContainsOperator>, SqlBuilder> = {
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
};

function normalizeFieldName(field: string): string {
	if (!field.startsWith("properties.") && field.includes(":")) {
		return `properties.${field}`;
	}
	return field;
}
