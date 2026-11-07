import process from "node:process";
import postgres from "postgres";

import { NodeFactory } from "domain/node_factory.ts";
import { Logger } from "shared/logger.ts";
import type { NodeLike } from "domain/node_like.ts";
import { type Embedding, EMBEDDING_DIMENSIONS } from "domain/nodes/embedding.ts";
import {
	type FilterOperator,
	isNodeFilters2D,
	type NodeFilter,
	type NodeFilters,
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

export class PostgresError extends AntboxError {
	static ERROR_CODE = "PostgresError";
	constructor(message: string) {
		super(PostgresError.ERROR_CODE, message);
	}
}

export default async function buildPostgresNodeRepository(
	connectionString?: string,
): Promise<Either<AntboxError, NodeRepository>> {
	try {
		const repository = new PostgresNodeRepository(connectionString);
		const initialized = await repository.initialize();
		if (initialized.isLeft()) {
			await repository.close();
			return left(initialized.value);
		}
		return right(repository);
	} catch (error) {
		return left(new PostgresError((error as Error).message));
	}
}

/**
 * Postgres-backed NodeRepository with pgvector support.
 *
 * @remarks
 * External setup:
 * - Provision a Postgres database and install the `vector` extension (pgvector).
 * - Grant the configured user permission to create extensions and tables.
 * - Set `DATABASE_URL` or pass a connection string.
 *
 * @example
 * const repo = new PostgresNodeRepository("postgres://user:pass@host/db");
 * await repo.initialize();
 */
/** Highest hnsw.ef_search pgvector accepts. */
const MAX_EF_SEARCH = 1000;
/** Portuguese with unaccent; created by initialize() when the unaccent extension is available. */
const ANTBOX_SEARCH_CONFIG = "antbox_pt";
const FALLBACK_SEARCH_CONFIG = "portuguese";

export class PostgresNodeRepository implements NodeRepository {
	readonly #sql: postgres.Sql;
	/** pgvector 0.8+ keeps scanning the HNSW index until filtered queries fill their LIMIT. */
	#iterativeScan = false;
	/** Text search configuration of the search_vector column. */
	#searchConfig = FALLBACK_SEARCH_CONFIG;

	constructor(connectionString?: string) {
		const connStr = connectionString ?? process.env.DATABASE_URL;
		if (!connStr) {
			throw new Error("DATABASE_URL environment variable is required");
		}
		this.#sql = postgres(connStr);
	}

	async initialize(): Promise<Either<AntboxError, void>> {
		try {
			// Enable required extensions
			await this.#sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
			await this.#sql`CREATE EXTENSION IF NOT EXISTS vector`;

			// Create nodes table with embedding column
			await this.#sql.unsafe(`
				CREATE TABLE IF NOT EXISTS nodes (
					uuid TEXT PRIMARY KEY,
					fid TEXT NOT NULL,
					title TEXT,
					parent TEXT,
					mimetype TEXT,
					body JSONB NOT NULL,
					embedding vector(${EMBEDDING_DIMENSIONS}),
					embedding_content_md TEXT
				)
			`);

			await this.#sql`
				ALTER TABLE nodes
				ADD COLUMN IF NOT EXISTS embedding_content_md TEXT,
				ADD COLUMN IF NOT EXISTS embedding_status TEXT,
				ADD COLUMN IF NOT EXISTS embedding_error TEXT,
				ADD COLUMN IF NOT EXISTS embedding_status_at TEXT
			`;

			await this.#migrateEmbeddingDimensions();
			await this.#initializeSearch();

			await this.#sql`
				UPDATE nodes SET embedding_status = 'indexed'
				WHERE embedding IS NOT NULL AND embedding_status IS NULL
			`;

			await this.#sql`
				CREATE INDEX IF NOT EXISTS idx_nodes_embedding_status
				ON nodes (embedding_status)
			`;

			const [extension] = await this.#sql<{ extversion: string }[]>`
				SELECT extversion FROM pg_extension WHERE extname = 'vector'
			`;
			this.#iterativeScan = isAtLeast(extension?.extversion ?? "0", [0, 8]);

			// Create indexes
			await this.#sql`
				CREATE INDEX IF NOT EXISTS idx_nodes_body
				ON nodes USING GIN (body)
			`;

			await this.#sql`
				CREATE INDEX IF NOT EXISTS idx_nodes_embedding
				ON nodes USING hnsw (embedding vector_cosine_ops)
			`;

			await this.#sql`
				CREATE INDEX IF NOT EXISTS idx_nodes_parent
				ON nodes (parent)
			`;

			await this.#sql`
				CREATE INDEX IF NOT EXISTS idx_nodes_fid
				ON nodes (fid)
			`;

			await this.#sql`
				CREATE INDEX IF NOT EXISTS idx_nodes_mimetype
				ON nodes (mimetype)
			`;

			return right(undefined);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresError(error.message));
		}
	}

	/**
	 * Resizes an embedding column created with another dimension. Its vectors cannot be compared
	 * with the ones providers emit now, so they are dropped and their status reset to pending;
	 * a "missing" reindex embeds them again.
	 */
	async #migrateEmbeddingDimensions(): Promise<void> {
		await this.#sql.begin(async (sql) => {
			await sql.unsafe(
				"SELECT pg_advisory_xact_lock(hashtext('antbox_nodes_embedding_dimensions'))",
			);
			const [column] = await sql.unsafe<{ dimensions: number }[]>(`
				SELECT atttypmod AS dimensions
				FROM pg_attribute
				WHERE attrelid = 'nodes'::regclass
					AND attname = 'embedding'
					AND atttypid = 'vector'::regtype
					AND NOT attisdropped
			`);
			if (!column || column.dimensions === EMBEDDING_DIMENSIONS) return;

			const [{ count }] = await sql.unsafe<{ count: string }[]>(
				"SELECT count(*) FROM nodes WHERE embedding IS NOT NULL",
			);
			Logger.warn(
				`PostgresNodeRepository: resizing embeddings from ${column.dimensions} to ${EMBEDDING_DIMENSIONS} dimensions, discarding ${count} stored vectors`,
			);
			await sql.unsafe("DROP INDEX IF EXISTS idx_nodes_embedding");
			await sql.unsafe(
				`ALTER TABLE nodes ALTER COLUMN embedding TYPE vector(${EMBEDDING_DIMENSIONS}) USING NULL`,
			);
			await sql.unsafe(
				"UPDATE nodes SET embedding_status = NULL, embedding_error = NULL, embedding_status_at = NULL WHERE embedding_status IS NOT NULL",
			);
		});
	}

	/**
	 * Full-text search: search_meta and search_body feed a generated tsvector (weights A and B)
	 * with a GIN index. The antbox_pt configuration is portuguese with unaccent before the stemmer;
	 * without the unaccent extension the plain portuguese configuration is used and accents count.
	 * An existing column keeps the configuration it was created with.
	 */
	async #initializeSearch(): Promise<void> {
		await this.#sql`
			ALTER TABLE nodes
			ADD COLUMN IF NOT EXISTS search_meta TEXT,
			ADD COLUMN IF NOT EXISTS search_body TEXT
		`;

		const [column] = await this.#sql<{ expression: string }[]>`
			SELECT pg_get_expr(d.adbin, d.adrelid) AS expression
			FROM pg_attribute a
			JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
			WHERE a.attrelid = 'nodes'::regclass AND a.attname = 'search_vector' AND NOT a.attisdropped
		`;
		if (column) {
			// The configuration as it resolves now, e.g. 'antbox_pt' or 'other_schema.antbox_pt'.
			this.#searchConfig = /'([^']+)'::regconfig/.exec(column.expression)?.[1] ??
				FALLBACK_SEARCH_CONFIG;
			return;
		}

		this.#searchConfig = await this.#createSearchConfig();
		await this.#sql.begin(async (sql) => {
			await sql.unsafe("SELECT pg_advisory_xact_lock(hashtext('antbox_nodes_search_vector'))");
			await sql.unsafe(`
				ALTER TABLE nodes ADD COLUMN IF NOT EXISTS search_vector tsvector
				GENERATED ALWAYS AS (
					setweight(to_tsvector('${this.#searchConfig}'::regconfig, coalesce(search_meta, '')), 'A') ||
					setweight(to_tsvector('${this.#searchConfig}'::regconfig, coalesce(search_body, '')), 'B')
				) STORED
			`);
			await sql.unsafe(
				"CREATE INDEX IF NOT EXISTS idx_nodes_search_vector ON nodes USING GIN (search_vector)",
			);
		});
	}

	/** Creates antbox_pt, or returns the portuguese configuration when unaccent is unavailable. */
	async #createSearchConfig(): Promise<string> {
		try {
			await this.#sql`CREATE EXTENSION IF NOT EXISTS unaccent`;
			await this.#sql.begin(async (sql) => {
				await sql.unsafe("SELECT pg_advisory_xact_lock(hashtext('antbox_search_config'))");
				const [existing] = await sql.unsafe(
					`SELECT 1 FROM pg_ts_config
					WHERE cfgname = '${ANTBOX_SEARCH_CONFIG}' AND pg_ts_config_is_visible(oid)`,
				);
				if (existing) return;
				await sql.unsafe(
					`CREATE TEXT SEARCH CONFIGURATION ${ANTBOX_SEARCH_CONFIG} (COPY = portuguese)`,
				);
				await sql.unsafe(
					`ALTER TEXT SEARCH CONFIGURATION ${ANTBOX_SEARCH_CONFIG}
					ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem`,
				);
			});
			return ANTBOX_SEARCH_CONFIG;
		} catch (error) {
			Logger.warn(
				`PostgresNodeRepository: cannot set up the unaccent search configuration ` +
					`(${(error as Error).message}); full-text search uses '${FALLBACK_SEARCH_CONFIG}' ` +
					"and accents must match",
			);
			return FALLBACK_SEARCH_CONFIG;
		}
	}

	supportsEmbeddings(): boolean {
		return true;
	}

	async saveContent(uuid: string, content: NodeContent): Promise<Either<AntboxError, void>> {
		try {
			const sql = this.#sql;
			const rows = await sql`
				UPDATE nodes
				SET embedding_content_md = ${content.markdown}
				${content.searchMeta === undefined ? sql`` : sql`, search_meta = ${content.searchMeta}`}
				${content.searchBody === undefined ? sql`` : sql`, search_body = ${content.searchBody}`}
				WHERE uuid = ${uuid}
				RETURNING uuid
			`;
			return rows.length ? right(undefined) : left(new NodeNotFoundError(uuid));
		} catch (err) {
			return left(new PostgresError((err as Error).message));
		}
	}

	/**
	 * The query text goes through the same configuration as the stored text (parser, unaccent,
	 * stemmer, stop words). Each resulting lexeme becomes a prefix term and all are required, so
	 * no tsquery operator in the text is ever interpreted. Ranked by ts_rank_cd with searchMeta
	 * weighted 1.0 and searchBody 0.1, normalized to rank / (rank + 1).
	 */
	async fts(query: string, options: FtsOptions): Promise<Either<AntboxError, FtsResult>> {
		const { pageSize, pageToken } = options;
		if (fulltextTerms(query).length === 0) {
			return right({ nodes: [], pageSize, pageToken, scores: {} });
		}

		try {
			const filters = options.filters ?? [];
			const { whereClause, params } = filters.length
				? this.#buildFilterQuery(filters)
				: { whereClause: "TRUE", params: [] as unknown[] };
			const queryParam = params.length + 1;
			const config = `'${this.#searchConfig}'::regconfig`;

			const rows = await this.#sql.unsafe<{ body: NodeMetadata; rank: number }[]>(
				`WITH search AS (
					SELECT string_agg(
						'''' || replace(replace(lexeme, '\\', '\\\\'), '''', '''''') || ''':*',
						' & '
					)::tsquery AS query
					FROM unnest(to_tsvector(${config}, $${queryParam}::text))
				)
				SELECT nodes.body, ts_rank_cd('{0.1, 0.2, 0.1, 1.0}', nodes.search_vector, search.query, 32)
					AS rank
				FROM nodes, search
				WHERE nodes.search_vector @@ search.query AND ${whereClause}
				ORDER BY rank DESC, nodes.uuid
				LIMIT $${queryParam + 1} OFFSET $${queryParam + 2}`,
				[...params, query, pageSize, pageSize * (pageToken - 1)] as (
					| string
					| number
					| boolean
					| null
				)[],
			);

			const nodes: NodeLike[] = [];
			const scores: Record<string, number> = {};
			for (const row of rows) {
				const nodeOrErr = NodeFactory.from(row.body);
				if (nodeOrErr.isLeft()) continue;
				nodes.push(nodeOrErr.value);
				scores[nodeOrErr.value.uuid] = Number(row.rank);
			}

			return right({ nodes, pageSize, pageToken, scores });
		} catch (err) {
			return left(new PostgresError((err as Error).message));
		}
	}

	async listWithoutSearchContent(limit: number): Promise<Either<AntboxError, string[]>> {
		try {
			const rows = await this.#sql<{ uuid: string }[]>`
				SELECT uuid FROM nodes WHERE search_meta IS NULL ORDER BY uuid LIMIT ${limit}
			`;
			return right(rows.map((row) => row.uuid));
		} catch (err) {
			return left(new PostgresError((err as Error).message));
		}
	}

	async upsertEmbedding(uuid: string, embedding: Embedding): Promise<Either<AntboxError, void>> {
		try {
			const vectorStr = `[${embedding.join(",")}]`;
			await this.#sql`
				UPDATE nodes
				SET
					embedding = ${vectorStr}::vector,
					embedding_status = 'indexed',
					embedding_error = NULL,
					embedding_status_at = ${new Date().toISOString()}
				WHERE uuid = ${uuid}
			`;
			return right(undefined);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresError(error.message));
		}
	}

	async vectorSearch(
		queryVector: Embedding,
		topK: number,
		options: VectorSearchOptions = {},
	): Promise<Either<AntboxError, VectorSearchResult>> {
		try {
			const filters = options.filters ?? [];
			const { whereClause, params } = filters.length
				? this.#buildFilterQuery(filters)
				: { whereClause: "TRUE", params: [] as unknown[] };
			const vectorParam = params.length + 1;
			const efSearch = Math.min(MAX_EF_SEARCH, Math.max(40, Math.ceil(topK)));
			const query = (exactScan: boolean) =>
				this.#sql.begin(async (sql) => {
					await sql.unsafe(`SET LOCAL hnsw.ef_search = ${efSearch}`);
					if (this.#iterativeScan) {
						await sql.unsafe("SET LOCAL hnsw.iterative_scan = strict_order");
					}
					if (exactScan) await sql.unsafe("SET LOCAL enable_indexscan = off");

					return await sql.unsafe<{
						body: NodeMetadata;
						score: number;
						embedding_content_md: string | null;
					}[]>(
						`SELECT
							body,
							embedding_content_md,
							1 - (embedding <=> $${vectorParam}::vector) AS score
						FROM nodes
						WHERE embedding IS NOT NULL AND ${whereClause}
						ORDER BY embedding <=> $${vectorParam}::vector
						LIMIT $${vectorParam + 1}`,
						[...params, `[${queryVector.join(",")}]`, topK] as (
							| string
							| number
							| boolean
							| null
						)[],
					);
				});

			// HNSW examines at most ef_search candidates before the WHERE clause runs. pgvector 0.8+
			// keeps scanning (up to hnsw.max_scan_tuples); older versions need an exact scan.
			const needsExact = filters.length > 0 || topK > MAX_EF_SEARCH;
			let rows = await query(needsExact && !this.#iterativeScan);
			if (needsExact && this.#iterativeScan && rows.length < topK) {
				// The iterative scan may stop early; an exact scan guarantees the filtered topK.
				rows = await query(true);
			}

			const nodes: VectorSearchResult["nodes"] = [];

			for (const row of rows) {
				const nodeResult = NodeFactory.from(row.body);
				if (nodeResult.isRight()) {
					nodes.push({
						node: nodeResult.right,
						score: Number(row.score),
						content: row.embedding_content_md ?? "",
					});
				}
			}

			return right({ nodes });
		} catch (err) {
			const error = err as Error;
			return left(new PostgresError(error.message));
		}
	}

	async getContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>> {
		if (uuids.length === 0) {
			return right({});
		}

		try {
			const rows = await this.#sql<{
				uuid: string;
				embedding_content_md: string | null;
			}[]>`
				SELECT uuid, embedding_content_md
				FROM nodes
				WHERE uuid IN ${this.#sql(uuids)}
			`;

			const contents: Record<string, string> = {};
			for (const row of rows) {
				if (
					typeof row.embedding_content_md === "string" && row.embedding_content_md.length > 0
				) {
					contents[row.uuid] = row.embedding_content_md;
				}
			}

			return right(contents);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresError(error.message));
		}
	}

	async deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			await this.#sql`
				UPDATE nodes
				SET
					embedding = NULL,
					embedding_status = NULL,
					embedding_error = NULL,
					embedding_status_at = NULL
				WHERE uuid = ${uuid}
			`;
			return right(undefined);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresError(error.message));
		}
	}

	async setEmbeddingStatus(
		uuid: string,
		status: "failed" | "skipped",
		error?: string,
	): Promise<Either<AntboxError, void>> {
		try {
			const at = new Date().toISOString();
			const rows = status === "skipped"
				? await this.#sql`
					UPDATE nodes
					SET embedding = NULL, embedding_status = 'skipped',
						embedding_error = NULL, embedding_status_at = ${at}
					WHERE uuid = ${uuid}
					RETURNING uuid
				`
				: await this.#sql`
					UPDATE nodes
					SET embedding_status = 'failed', embedding_error = ${error ?? null},
						embedding_status_at = ${at}
					WHERE uuid = ${uuid}
					RETURNING uuid
				`;
			return rows.length ? right(undefined) : left(new NodeNotFoundError(uuid));
		} catch (err) {
			return left(new PostgresError((err as Error).message));
		}
	}

	async getEmbeddingStatuses(
		uuids: string[],
	): Promise<Either<AntboxError, Record<string, EmbeddingStatusRecord>>> {
		if (uuids.length === 0) return right({});
		try {
			const rows = await this.#sql<{
				uuid: string;
				embedding_status: EmbeddingStatus | null;
				embedding_error: string | null;
				embedding_status_at: string | null;
			}[]>`
				SELECT uuid, embedding_status, embedding_error, embedding_status_at
				FROM nodes
				WHERE uuid IN ${this.#sql(uuids)}
			`;

			const statuses: Record<string, EmbeddingStatusRecord> = {};
			for (const row of rows) {
				statuses[row.uuid] = {
					status: row.embedding_status,
					...(row.embedding_error ? { error: row.embedding_error } : {}),
					...(row.embedding_status_at ? { at: row.embedding_status_at } : {}),
				};
			}
			return right(statuses);
		} catch (err) {
			return left(new PostgresError((err as Error).message));
		}
	}

	async countEmbeddingStatuses(): Promise<Either<AntboxError, EmbeddingStatusCounts>> {
		try {
			const rows = await this.#sql<{ status: EmbeddingStatus | null; n: string }[]>`
				SELECT embedding_status AS status, count(*) AS n FROM nodes GROUP BY embedding_status
			`;
			const counts: EmbeddingStatusCounts = { indexed: 0, failed: 0, skipped: 0, pending: 0 };
			for (const row of rows) counts[row.status ?? "pending"] += Number(row.n);
			return right(counts);
		} catch (err) {
			return left(new PostgresError((err as Error).message));
		}
	}

	async aggregateTotalSize(): Promise<Either<AntboxError, number>> {
		try {
			const result = await this.#sql`
				SELECT SUM((body->>'size')::numeric) as total
				FROM nodes
			`;
			const total = Number(result[0]?.total ?? 0);
			return right(total);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresError(error.message));
		}
	}

	async add(node: NodeLike): Promise<Either<DuplicatedNodeError, void>> {
		try {
			const metadata = node.metadata;
			const bodyJson = JSON.stringify(metadata);
			await this.#sql`
				INSERT INTO nodes (uuid, fid, title, parent, mimetype, body)
				VALUES (
					${node.uuid},
					${metadata.fid},
					${metadata.title},
					${metadata.parent},
					${metadata.mimetype},
					${bodyJson}::text::jsonb
				)
			`;
			return right(undefined);
		} catch (err) {
			const error = err as Error;
			if (error.message.includes("duplicate key") || error.message.includes("unique")) {
				return left(new DuplicatedNodeError(node.uuid));
			}
			return left(new DuplicatedNodeError(node.uuid));
		}
	}

	async getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		try {
			const rows = await this.#sql<{ body: NodeMetadata }[]>`
				SELECT body FROM nodes WHERE uuid = ${uuid}
			`;

			if (rows.length === 0) {
				return left(new NodeNotFoundError(uuid));
			}

			const nodeResult = NodeFactory.from(rows[0].body);
			if (nodeResult.isLeft()) {
				return left(new NodeNotFoundError(uuid));
			}

			return right(nodeResult.right);
		} catch (_err) {
			return left(new NodeNotFoundError(uuid));
		}
	}

	async getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		try {
			const rows = await this.#sql<{ body: NodeMetadata }[]>`
				SELECT body FROM nodes WHERE fid = ${fid}
			`;

			if (rows.length === 0) {
				return left(new NodeNotFoundError(fid));
			}

			const nodeResult = NodeFactory.from(rows[0].body);
			if (nodeResult.isLeft()) {
				return left(new NodeNotFoundError(fid));
			}

			return right(nodeResult.right);
		} catch (_err) {
			return left(new NodeNotFoundError(fid));
		}
	}

	async update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
		const existing = await this.getById(node.uuid);
		if (existing.isLeft()) {
			return left(existing.value);
		}

		try {
			const metadata = node.metadata;
			const bodyJson = JSON.stringify(metadata);
			await this.#sql`
				UPDATE nodes
				SET
					fid = ${metadata.fid},
					title = ${metadata.title},
					parent = ${metadata.parent},
					mimetype = ${metadata.mimetype},
					body = ${bodyJson}::text::jsonb
				WHERE uuid = ${node.uuid}
			`;
			return right(undefined);
		} catch (_err) {
			return left(new NodeNotFoundError(node.uuid));
		}
	}

	async touch(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			const rows = await this.#sql`
				UPDATE nodes
				SET body = jsonb_set(body, '{modifiedTime}', to_jsonb(${
				new Date().toISOString()
			}::text))
				WHERE uuid = ${uuid}
				RETURNING uuid
			`;
			return rows.length ? right(undefined) : left(new NodeNotFoundError(uuid));
		} catch (error) {
			return left(new PostgresError(error instanceof Error ? error.message : String(error)));
		}
	}

	async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const existing = await this.getById(uuid);
		if (existing.isLeft()) {
			return left(existing.value);
		}

		try {
			await this.#sql`DELETE FROM nodes WHERE uuid = ${uuid}`;
			return right(undefined);
		} catch (_err) {
			return left(new NodeNotFoundError(uuid));
		}
	}

	async filter(
		filters: NodeFilters,
		pageSize = 20,
		pageToken = 1,
	): Promise<NodeFilterResult> {
		try {
			const offset = pageSize * (pageToken - 1);

			if (filters.length === 0) {
				return this.#findAll(pageSize, offset, pageToken);
			}

			const { whereClause, params } = this.#buildFilterQuery(filters);

			const query = `
				SELECT body FROM nodes
				WHERE ${whereClause}
				LIMIT $${params.length + 1} OFFSET $${params.length + 2}
			`;

			const allParams = [...params, pageSize, offset] as (
				| string
				| number
				| boolean
				| null
			)[];

			const rows = await this.#sql.unsafe<{ body: NodeMetadata }[]>(
				query,
				allParams,
			);

			const nodes = rows
				.map((row) => NodeFactory.from(row.body))
				.filter((result) => result.isRight())
				.map((result) => result.right);

			return {
				nodes,
				pageSize,
				pageToken,
			};
		} catch (err) {
			Logger.error("Filter error:", err);
			return {
				nodes: [],
				pageSize,
				pageToken,
			};
		}
	}

	async countMatching(filters: NodeFilters): Promise<Either<AntboxError, number>> {
		try {
			const { whereClause, params } = filters.length === 0
				? { whereClause: "TRUE", params: [] }
				: this.#buildFilterQuery(filters);
			const rows = await this.#sql.unsafe<{ total: string | number }[]>(
				`SELECT COUNT(*) AS total FROM nodes WHERE ${whereClause}`,
				params as (string | number | boolean | null)[],
			);
			return right(Number(rows[0]?.total ?? 0));
		} catch (err) {
			Logger.error("Count error:", err);
			return left(new PostgresError(String(err)));
		}
	}

	async #findAll(
		pageSize: number,
		offset: number,
		pageToken: number,
	): Promise<NodeFilterResult> {
		const rows = await this.#sql<{ body: NodeMetadata }[]>`
			SELECT body FROM nodes LIMIT ${pageSize} OFFSET ${offset}
		`;

		const nodes = rows
			.map((row) => NodeFactory.from(row.body))
			.filter((result) => result.isRight())
			.map((result) => result.right);

		return {
			nodes,
			pageSize,
			pageToken,
		};
	}

	#buildFilterQuery(filters: NodeFilters): {
		whereClause: string;
		params: unknown[];
	} {
		const params: unknown[] = [];
		let paramIndex = 1;

		const orFilters = isNodeFilters2D(filters) ? filters : [filters];

		const orClauses = orFilters.map((andFilters) => {
			const andClauses = andFilters.map((filter) => {
				const { clause, newParamIndex } = this.#filterToSql(
					filter,
					params,
					paramIndex,
				);
				paramIndex = newParamIndex;
				return clause;
			});

			return andClauses.length > 1 ? `(${andClauses.join(" AND ")})` : (andClauses[0] ?? "TRUE");
		});

		const whereClause = orClauses.length > 1 ? `(${orClauses.join(" OR ")})` : orClauses[0];

		return { whereClause, params };
	}

	#filterToSql(
		filter: NodeFilter,
		params: unknown[],
		paramIndex: number,
	): { clause: string; newParamIndex: number } {
		const [rawField, operator, value] = filter;
		const field = normalizeFieldName(rawField);
		if (isFulltextFilter(filter)) return { clause: "FALSE", newParamIndex: paramIndex };

		// Promoted columns use direct SQL, others use JSONB
		const promotedColumns = ["uuid", "fid", "title", "parent", "mimetype"];
		const isPromoted = promotedColumns.includes(field);

		return this.#buildOperatorClause(
			field,
			operator,
			value,
			params,
			paramIndex,
			isPromoted,
		);
	}

	#buildOperatorClause(
		field: string,
		operator: FilterOperator,
		value: unknown,
		params: unknown[],
		paramIndex: number,
		isPromoted: boolean,
	): { clause: string; newParamIndex: number } {
		if (
			([">", ">=", "<", "<="].includes(operator) &&
				typeof value !== "string" && typeof value !== "number") ||
			(operator === "match" && typeof value === "object" && value !== null)
		) return { clause: "FALSE", newParamIndex: paramIndex };
		if (Array.isArray(value) && value.length === 0) {
			if (operator === "in" || operator === "contains-any") {
				return { clause: "FALSE", newParamIndex: paramIndex };
			}
			if (operator === "not-in" || operator === "contains-none") {
				return { clause: "TRUE", newParamIndex: paramIndex };
			}
		}

		const usesJsonPath = operator !== "==" && (
			!isPromoted || operator.includes("contains")
		);
		const jsonPath = usesJsonPath
			? field.split(".").map((part) => {
				params.push(part);
				return `$${paramIndex++}::text`;
			}).join(", ")
			: "";
		const jsonValue = `jsonb_extract_path(body, ${jsonPath})`;
		const textValue = `jsonb_extract_path_text(body, ${jsonPath})`;
		// The contains family applies only to arrays: a non-array (or missing) value contains nothing.
		const isArray = `COALESCE(jsonb_typeof(${jsonValue}), '') = 'array'`;

		switch (operator) {
			case "==": {
				if (isPromoted) {
					params.push(value);
					return { clause: `${field} = $${paramIndex}`, newParamIndex: paramIndex + 1 };
				}
				// Use JSONB containment for nested fields
				const pathParts = field.split(".");
				const jsonValue = this.#buildNestedJson(pathParts, value);
				params.push(JSON.stringify(jsonValue));
				return {
					clause: `body @> $${paramIndex}::text::jsonb`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "!=": {
				params.push(isPromoted ? value : JSON.stringify(value));
				if (isPromoted) {
					return { clause: `${field} != $${paramIndex}`, newParamIndex: paramIndex + 1 };
				}
				return {
					clause: `${jsonValue} != $${paramIndex}::text::jsonb`,
					newParamIndex: paramIndex + 1,
				};
			}

			case ">":
			case ">=":
			case "<":
			case "<=": {
				params.push(value);
				if (isPromoted) {
					return {
						clause: `${field} ${operator} $${paramIndex}`,
						newParamIndex: paramIndex + 1,
					};
				}
				return {
					clause: `(${textValue})::numeric ${operator} $${paramIndex}`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "in": {
				const values = value as unknown[];
				const placeholders = values.map((_, i) => `$${paramIndex + i}`).join(", ");
				params.push(...values);
				if (isPromoted) {
					return {
						clause: `${field} IN (${placeholders})`,
						newParamIndex: paramIndex + values.length,
					};
				}
				return {
					clause: `${textValue} IN (${placeholders})`,
					newParamIndex: paramIndex + values.length,
				};
			}

			case "not-in": {
				const values = value as unknown[];
				const placeholders = values.map((_, i) => `$${paramIndex + i}`).join(", ");
				params.push(...values);
				if (isPromoted) {
					return {
						clause: `${field} NOT IN (${placeholders})`,
						newParamIndex: paramIndex + values.length,
					};
				}
				return {
					clause: `${textValue} NOT IN (${placeholders})`,
					newParamIndex: paramIndex + values.length,
				};
			}

			case "match": {
				const pattern = String(value).trim().replaceAll(/[\\%_]/g, "\\$&").replaceAll(
					/\s+/g,
					"%",
				);
				params.push(`%${pattern}%`);
				if (isPromoted) {
					return {
						clause: `${field} ILIKE $${paramIndex}`,
						newParamIndex: paramIndex + 1,
					};
				}
				return {
					clause: `${textValue} ILIKE $${paramIndex}`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "contains": {
				params.push(JSON.stringify([value]));
				return {
					clause: `(${isArray} AND ${jsonValue} @> $${paramIndex}::text::jsonb)`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "not-contains": {
				params.push(JSON.stringify([value]));
				return {
					clause: `NOT (${isArray} AND ${jsonValue} @> $${paramIndex}::text::jsonb)`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "contains-all": {
				const values = value as unknown[];
				params.push(JSON.stringify(values));
				return {
					clause: `(${isArray} AND ${jsonValue} @> $${paramIndex}::text::jsonb)`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "contains-any": {
				const values = value as unknown[];
				const conditions = values.map((v, i) => {
					params.push(JSON.stringify([v]));
					return `${jsonValue} @> $${paramIndex + i}::text::jsonb`;
				});
				return {
					clause: `(${isArray} AND (${conditions.join(" OR ")}))`,
					newParamIndex: paramIndex + values.length,
				};
			}

			case "contains-none": {
				const values = value as unknown[];
				const conditions = values.map((v, i) => {
					params.push(JSON.stringify([v]));
					return `${jsonValue} @> $${paramIndex + i}::text::jsonb`;
				});
				return {
					clause: `NOT (${isArray} AND (${conditions.join(" OR ")}))`,
					newParamIndex: paramIndex + values.length,
				};
			}

			default:
				return { clause: "FALSE", newParamIndex: paramIndex };
		}
	}

	#buildNestedJson(pathParts: string[], value: unknown): Record<string, unknown> {
		if (pathParts.length === 1) {
			return { [pathParts[0]]: value };
		}

		const [first, ...rest] = pathParts;
		return { [first]: this.#buildNestedJson(rest, value) };
	}

	async close(): Promise<void> {
		await this.#sql.end();
	}
}

function normalizeFieldName(field: string): string {
	if (!field.startsWith("properties.") && field.includes(":")) {
		return `properties.${field}`;
	}
	return field;
}

/** True when a dotted version such as "0.8.1" is at least the given major and minor. */
function isAtLeast(version: string, [major, minor]: [number, number]): boolean {
	const [vMajor = 0, vMinor = 0] = version.split(".").map((part) => parseInt(part, 10) || 0);
	return vMajor > major || (vMajor === major && vMinor >= minor);
}
