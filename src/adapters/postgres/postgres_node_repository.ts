import postgres from "npm:postgres";

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

export class PostgresError extends AntboxError {
	static ERROR_CODE = "PostgresError";
	constructor(message: string) {
		super(PostgresError.ERROR_CODE, message);
	}
}

export class PostgresNodeRepository implements NodeRepository {
	readonly #sql: postgres.Sql;

	constructor(connectionString?: string) {
		const connStr = connectionString ?? Deno.env.get("DATABASE_URL");
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
			await this.#sql`
				CREATE TABLE IF NOT EXISTS nodes (
					uuid TEXT PRIMARY KEY,
					fid TEXT UNIQUE NOT NULL,
					title TEXT,
					parent TEXT,
					mimetype TEXT,
					body JSONB NOT NULL,
					embedding vector(1536)
				)
			`;

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

	supportsEmbeddings(): boolean {
		return true;
	}

	async upsertEmbedding(
		uuid: string,
		embedding: Embedding,
	): Promise<Either<AntboxError, void>> {
		try {
			const vectorStr = `[${embedding.join(",")}]`;
			await this.#sql`
				UPDATE nodes
				SET embedding = ${vectorStr}::vector
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
	): Promise<Either<AntboxError, VectorSearchResult>> {
		try {
			const vectorStr = `[${queryVector.join(",")}]`;

			const rows = await this.#sql<{ body: NodeMetadata; score: number }[]>`
				SELECT
					body,
					1 - (embedding <=> ${vectorStr}::vector) as score
				FROM nodes
				WHERE embedding IS NOT NULL
				ORDER BY embedding <=> ${vectorStr}::vector
				LIMIT ${topK}
			`;

			const nodes: VectorSearchResult["nodes"] = [];

			for (const row of rows) {
				const nodeResult = NodeFactory.from(row.body);
				if (nodeResult.isRight()) {
					nodes.push({
						node: nodeResult.right,
						score: row.score,
					});
				}
			}

			return right({ nodes });
		} catch (err) {
			const error = err as Error;
			return left(new PostgresError(error.message));
		}
	}

	async deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			await this.#sql`
				UPDATE nodes
				SET embedding = NULL
				WHERE uuid = ${uuid}
			`;
			return right(undefined);
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
					${bodyJson}::jsonb
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
					body = ${bodyJson}::jsonb
				WHERE uuid = ${node.uuid}
			`;
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

			return andClauses.length > 1 ? `(${andClauses.join(" AND ")})` : andClauses[0];
		});

		const whereClause = orClauses.length > 1 ? `(${orClauses.join(" OR ")})` : orClauses[0];

		return { whereClause, params };
	}

	#filterToSql(
		filter: NodeFilter,
		params: unknown[],
		paramIndex: number,
	): { clause: string; newParamIndex: number } {
		const [field, operator, value] = filter;

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
		const columnRef = isPromoted ? field : `body->>'${field}'`;
		const jsonPath = field.split(".").map((p) => `'${p}'`).join("->");

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
					clause: `body @> $${paramIndex}::jsonb`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "!=": {
				params.push(value);
				if (isPromoted) {
					return { clause: `${field} != $${paramIndex}`, newParamIndex: paramIndex + 1 };
				}
				return {
					clause: `body->${jsonPath} != to_jsonb($${paramIndex}::text)`,
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
					clause: `(body->>${jsonPath})::numeric ${operator} $${paramIndex}`,
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
					clause: `body->>${jsonPath} IN (${placeholders})`,
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
					clause: `body->>${jsonPath} NOT IN (${placeholders})`,
					newParamIndex: paramIndex + values.length,
				};
			}

			case "match": {
				params.push(`%${value}%`);
				if (isPromoted) {
					return {
						clause: `${field} ILIKE $${paramIndex}`,
						newParamIndex: paramIndex + 1,
					};
				}
				return {
					clause: `body->>${jsonPath} ILIKE $${paramIndex}`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "contains": {
				params.push(JSON.stringify([value]));
				return {
					clause: `body->${jsonPath} @> $${paramIndex}::jsonb`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "not-contains": {
				params.push(JSON.stringify([value]));
				return {
					clause: `NOT (body->${jsonPath} @> $${paramIndex}::jsonb)`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "contains-all": {
				const values = value as unknown[];
				params.push(JSON.stringify(values));
				return {
					clause: `body->${jsonPath} @> $${paramIndex}::jsonb`,
					newParamIndex: paramIndex + 1,
				};
			}

			case "contains-any": {
				const values = value as unknown[];
				const conditions = values.map((v, i) => {
					params.push(JSON.stringify([v]));
					return `body->${jsonPath} @> $${paramIndex + i}::jsonb`;
				});
				return {
					clause: `(${conditions.join(" OR ")})`,
					newParamIndex: paramIndex + values.length,
				};
			}

			case "contains-none": {
				const values = value as unknown[];
				const conditions = values.map((v, i) => {
					params.push(JSON.stringify([v]));
					return `NOT (body->${jsonPath} @> $${paramIndex + i}::jsonb)`;
				});
				return {
					clause: `(${conditions.join(" AND ")})`,
					newParamIndex: paramIndex + values.length,
				};
			}

			default:
				return { clause: "TRUE", newParamIndex: paramIndex };
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
