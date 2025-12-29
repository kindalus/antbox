import { Database } from "jsr:@db/sqlite";

import type {
	CollectionMap,
	ConfigurationRepository,
} from "domain/configuration/configuration_repository.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

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
	readonly #db: Database;
	readonly #existingTables: Set<string>;

	constructor(baseFolder?: string) {
		if (baseFolder) {
			Deno.mkdirSync(baseFolder, { recursive: true });
			this.#db = new Database(`${baseFolder}/config.db`);
		} else {
			this.#db = new Database(":memory:");
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

		// Users collection uses email as key, others use uuid
		const keyExpression = collection === "users"
			? "json_extract(body, '$.email')"
			: "json_extract(body, '$.uuid')";

		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS ${tableName} (
				uuid TEXT GENERATED ALWAYS AS (${keyExpression}) STORED PRIMARY KEY,
				body JSON NOT NULL
			);
		`);

		this.#existingTables.add(tableName);
	}

	save<K extends keyof CollectionMap>(
		collection: K,
		data: CollectionMap[K],
	): Promise<Either<AntboxError, CollectionMap[K]>> {
		try {
			this.#ensureTable(collection);
			const tableName = this.#getTableName(collection);
			const body = JSON.stringify(data);

			this.#db.exec(
				`INSERT INTO ${tableName} (body) VALUES (?)
				 ON CONFLICT(uuid) DO UPDATE SET body = excluded.body`,
				[body],
			);

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

			this.#db.exec(`DELETE FROM ${tableName} WHERE uuid = ?`, [uuid]);

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
