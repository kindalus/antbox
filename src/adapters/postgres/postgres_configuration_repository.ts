import postgres from "npm:postgres";

import type {
	CollectionMap,
	ConfigurationRepository,
} from "domain/configuration/configuration_repository.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export class PostgresConfigurationError extends AntboxError {
	static ERROR_CODE = "PostgresConfigurationError";
	constructor(message: string) {
		super(PostgresConfigurationError.ERROR_CODE, message);
	}
}

/**
 * Postgres-backed ConfigurationRepository.
 *
 * @remarks
 * External setup:
 * - Provision a Postgres database and ensure the `uuid-ossp` extension is available.
 * - Grant the configured user permission to create extensions and tables.
 * - Set `DATABASE_URL` or pass a connection string.
 *
 * @example
 * const repo = new PostgresConfigurationRepository("postgres://user:pass@host/db");
 * await repo.initialize();
 */
export class PostgresConfigurationRepository implements ConfigurationRepository {
	readonly #sql: postgres.Sql;
	readonly #existingTables: Set<string>;

	constructor(connectionString?: string) {
		const connStr = connectionString ?? Deno.env.get("DATABASE_URL");
		if (!connStr) {
			throw new Error("DATABASE_URL environment variable is required");
		}
		this.#sql = postgres(connStr);
		this.#existingTables = new Set();
	}

	async initialize(): Promise<Either<AntboxError, void>> {
		try {
			await this.#sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
			return right(undefined);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresConfigurationError(error.message));
		}
	}

	#toSnakeCase(str: string): string {
		return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
	}

	#getTableName(collection: keyof CollectionMap): string {
		return `config_${this.#toSnakeCase(collection)}`;
	}

	async #ensureTable(collection: keyof CollectionMap): Promise<void> {
		const tableName = this.#getTableName(collection);

		if (this.#existingTables.has(tableName)) {
			return;
		}

		await this.#sql.unsafe(`
			CREATE TABLE IF NOT EXISTS ${tableName} (
				uuid TEXT PRIMARY KEY,
				body JSONB NOT NULL
			)
		`);

		this.#existingTables.add(tableName);
	}

	#getKey<K extends keyof CollectionMap>(
		collection: K,
		data: CollectionMap[K],
	): string {
		if (collection === "users") {
			return (data as { email: string }).email;
		}
		return (data as { uuid: string }).uuid;
	}

	async save<K extends keyof CollectionMap>(
		collection: K,
		data: CollectionMap[K],
	): Promise<Either<AntboxError, CollectionMap[K]>> {
		try {
			await this.#ensureTable(collection);
			const tableName = this.#getTableName(collection);
			const key = this.#getKey(collection, data);

			await this.#sql.unsafe(
				`INSERT INTO ${tableName} (uuid, body)
				 VALUES ($1, $2)
				 ON CONFLICT (uuid) DO UPDATE SET body = EXCLUDED.body`,
				[key, JSON.stringify(data)],
			);

			return right(data);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresConfigurationError(error.message));
		}
	}

	async get<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, CollectionMap[K]>> {
		try {
			await this.#ensureTable(collection);
			const tableName = this.#getTableName(collection);

			const rows = await this.#sql.unsafe<{ body: Record<string, unknown> }[]>(
				`SELECT body FROM ${tableName} WHERE uuid = $1`,
				[uuid],
			);

			if (rows.length === 0) {
				return left(
					new BadRequestError(`${String(collection)} with uuid '${uuid}' not found`),
				);
			}

			const data = rows[0].body as unknown as CollectionMap[K];
			return right(data);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresConfigurationError(error.message));
		}
	}

	async list<K extends keyof CollectionMap>(
		collection: K,
	): Promise<Either<AntboxError, CollectionMap[K][]>> {
		try {
			await this.#ensureTable(collection);
			const tableName = this.#getTableName(collection);

			const rows = await this.#sql.unsafe<{ body: Record<string, unknown> }[]>(
				`SELECT body FROM ${tableName}`,
			);

			const items = rows.map((row) => row.body as unknown as CollectionMap[K]);
			return right(items);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresConfigurationError(error.message));
		}
	}

	async delete<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		try {
			await this.#ensureTable(collection);
			const tableName = this.#getTableName(collection);

			// Check if exists
			const existing = await this.#sql.unsafe<{ uuid: string }[]>(
				`SELECT uuid FROM ${tableName} WHERE uuid = $1`,
				[uuid],
			);

			if (existing.length === 0) {
				return left(
					new BadRequestError(`${String(collection)} with uuid '${uuid}' not found`),
				);
			}

			await this.#sql.unsafe(
				`DELETE FROM ${tableName} WHERE uuid = $1`,
				[uuid],
			);

			return right(undefined);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresConfigurationError(error.message));
		}
	}

	async close(): Promise<void> {
		await this.#sql.end();
	}
}
