import fsSync from "node:fs";
import { DatabaseSync } from "node:sqlite";

import type {
	CollectionMap,
	ConfigurationRepository,
} from "domain/configuration/configuration_repository.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

/**
 * Builds a SQLite-backed ConfigurationRepository.
 *
 * @remarks
 * External setup:
 * - For persistent storage, pass `baseFolder` and ensure it is writable.
 * - The process needs read and write access to the data path.
 *
 * @example
 * const repoOrErr = await buildSqliteConfigurationRepository("/var/lib/antbox");
 * if (repoOrErr.isRight()) {
 *   const repo = repoOrErr.value;
 * }
 */
export default function buildSqliteConfigurationRepository(
	baseFolder?: string,
): Promise<Either<AntboxError, ConfigurationRepository>> {
	return Promise.resolve(right(new SqliteConfigurationRepository(baseFolder)));
}

export class SqliteConfigurationError extends AntboxError {
	static ERROR_CODE = "SqliteConfigurationError";
	constructor(message: string) {
		super(SqliteConfigurationError.ERROR_CODE, message);
	}
}

export class SqliteConfigurationRepository implements ConfigurationRepository {
	readonly #db: DatabaseSync;
	readonly #existingTables: Set<string>;

	constructor(baseFolder?: string) {
		if (baseFolder) {
			fsSync.mkdirSync(baseFolder, { recursive: true });
			this.#db = new DatabaseSync(`${baseFolder}/config.db`);
		} else {
			this.#db = new DatabaseSync(":memory:");
		}

		this.#existingTables = new Set();
		this.#initialize();
	}

	#initialize(): void {
		this.#db.exec("PRAGMA journal_mode = WAL;");
	}

	#toSnakeCase(str: string): string {
		return str.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
	}

	#getTableName(collection: keyof CollectionMap): string {
		return `config_${this.#toSnakeCase(collection)}`;
	}

	#ensureTable(collection: keyof CollectionMap): void {
		const tableName = this.#getTableName(collection);

		if (this.#existingTables.has(tableName)) {
			return;
		}

		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS ${tableName} (
				uuid TEXT PRIMARY KEY,
				body JSON NOT NULL
			);
		`);

		this.#existingTables.add(tableName);
	}

	#extractKey<K extends keyof CollectionMap>(collection: K, data: CollectionMap[K]): string {
		// Users and userPreferences collections use email as key, others use uuid
		const record = data as unknown as Record<string, unknown>;
		return collection === "users" || collection === "userPreferences"
			? record.email as string
			: record.uuid as string;
	}

	save<K extends keyof CollectionMap>(
		collection: K,
		data: CollectionMap[K],
	): Promise<Either<AntboxError, CollectionMap[K]>> {
		try {
			this.#ensureTable(collection);
			const tableName = this.#getTableName(collection);
			const uuid = this.#extractKey(collection, data);
			const body = JSON.stringify(data);

			this.#db.prepare(
				`INSERT INTO ${tableName} (uuid, body) VALUES (?, ?)
				 ON CONFLICT(uuid) DO UPDATE SET body = excluded.body`,
			).run(uuid, body);

			return Promise.resolve(right(data));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteConfigurationError(error.message)));
		}
	}

	get<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, CollectionMap[K]>> {
		try {
			this.#ensureTable(collection);
			const tableName = this.#getTableName(collection);

			const row = this.#db
				.prepare(`SELECT body FROM ${tableName} WHERE uuid = ?`)
				.get(uuid) as { body: string } | undefined;

			if (!row) {
				return Promise.resolve(
					left(new BadRequestError(`${String(collection)} with uuid '${uuid}' not found`)),
				);
			}

			const data = JSON.parse(row.body) as CollectionMap[K];
			return Promise.resolve(right(data));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteConfigurationError(error.message)));
		}
	}

	list<K extends keyof CollectionMap>(
		collection: K,
	): Promise<Either<AntboxError, CollectionMap[K][]>> {
		try {
			this.#ensureTable(collection);
			const tableName = this.#getTableName(collection);

			const rows = this.#db
				.prepare(`SELECT body FROM ${tableName}`)
				.all() as { body: string }[];

			const items = rows.map((row) => JSON.parse(row.body) as CollectionMap[K]);
			return Promise.resolve(right(items));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteConfigurationError(error.message)));
		}
	}

	delete<K extends keyof CollectionMap>(
		collection: K,
		uuid: string,
	): Promise<Either<AntboxError, void>> {
		try {
			this.#ensureTable(collection);
			const tableName = this.#getTableName(collection);

			const existing = this.#db
				.prepare(`SELECT 1 FROM ${tableName} WHERE uuid = ?`)
				.get(uuid);

			if (!existing) {
				return Promise.resolve(
					left(new BadRequestError(`${String(collection)} with uuid '${uuid}' not found`)),
				);
			}

			this.#db.prepare(`DELETE FROM ${tableName} WHERE uuid = ?`).run(uuid);

			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteConfigurationError(error.message)));
		}
	}

	close(): void {
		this.#db.close();
	}
}
