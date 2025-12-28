import { Database } from "jsr:@db/sqlite";

import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export default function buildSqliteEventStoreRepository(
	baseFolder?: string,
): Promise<Either<AntboxError, EventStoreRepository>> {
	return Promise.resolve(right(new SqliteEventStoreRepository(baseFolder)));
}

export class SqliteEventStoreError extends AntboxError {
	static ERROR_CODE = "SqliteEventStoreError";
	constructor(message: string) {
		super(SqliteEventStoreError.ERROR_CODE, message);
	}
}

export class SqliteEventStoreRepository implements EventStoreRepository {
	readonly #db: Database;
	readonly #existingTables: Set<string>;

	constructor(baseFolder?: string) {
		if (baseFolder) {
			Deno.mkdirSync(baseFolder, { recursive: true });
			this.#db = new Database(`${baseFolder}/events.db`);
		} else {
			this.#db = new Database(":memory:");
		}

		this.#existingTables = new Set();
		this.#initialize();
	}

	#initialize(): void {
		this.#db.exec("PRAGMA journal_mode = WAL;");
	}

	#sanitizeMimetype(mimetype: string): string {
		return mimetype.replace(/\//g, "_");
	}

	#getTableName(mimetype: string): string {
		return `events_${this.#sanitizeMimetype(mimetype)}`;
	}

	#ensureTable(mimetype: string): void {
		const tableName = this.#getTableName(mimetype);

		if (this.#existingTables.has(tableName)) {
			return;
		}

		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS ${tableName} (
				streamId TEXT NOT NULL,
				sequence INTEGER NOT NULL,
				payload JSON NOT NULL,
				timestamp TEXT NOT NULL,
				PRIMARY KEY (streamId, sequence)
			);
		`);

		this.#db.exec(`
			CREATE INDEX IF NOT EXISTS idx_${tableName}_stream
			ON ${tableName}(streamId, sequence);
		`);

		this.#existingTables.add(tableName);
	}

	append(
		streamId: string,
		mimetype: string,
		event: Omit<AuditEvent, "streamId" | "sequence">,
	): Promise<Either<AntboxError, void>> {
		try {
			this.#ensureTable(mimetype);
			const tableName = this.#getTableName(mimetype);

			const sequenceRow = this.#db
				.prepare(
					`SELECT COALESCE(MAX(sequence), -1) + 1 as nextSeq FROM ${tableName} WHERE streamId = ?`,
				)
				.get(streamId) as { nextSeq: number };

			const sequence = sequenceRow.nextSeq;
			const payload = JSON.stringify(event);
			const timestamp = event.occurredOn;

			this.#db.exec(
				`INSERT INTO ${tableName} (streamId, sequence, payload, timestamp) VALUES (?, ?, ?, ?)`,
				[streamId, sequence, payload, timestamp],
			);

			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteEventStoreError(error.message)));
		}
	}

	getStream(
		streamId: string,
		mimetype: string,
	): Promise<Either<AntboxError, AuditEvent[]>> {
		try {
			this.#ensureTable(mimetype);
			const tableName = this.#getTableName(mimetype);

			const rows = this.#db
				.prepare(
					`SELECT streamId, sequence, payload FROM ${tableName} WHERE streamId = ? ORDER BY sequence`,
				)
				.all(streamId) as { streamId: string; sequence: number; payload: string }[];

			const events: AuditEvent[] = rows.map((row) => {
				const eventData = JSON.parse(row.payload) as Omit<AuditEvent, "streamId" | "sequence">;
				return {
					...eventData,
					streamId: row.streamId,
					sequence: row.sequence,
				};
			});

			return Promise.resolve(right(events));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteEventStoreError(error.message)));
		}
	}

	getStreamsByMimetype(
		mimetype: string,
	): Promise<Either<AntboxError, Map<string, AuditEvent[]>>> {
		try {
			this.#ensureTable(mimetype);
			const tableName = this.#getTableName(mimetype);

			const rows = this.#db
				.prepare(
					`SELECT streamId, sequence, payload FROM ${tableName} ORDER BY streamId, sequence`,
				)
				.all() as { streamId: string; sequence: number; payload: string }[];

			const result = new Map<string, AuditEvent[]>();

			for (const row of rows) {
				const eventData = JSON.parse(row.payload) as Omit<AuditEvent, "streamId" | "sequence">;
				const event: AuditEvent = {
					...eventData,
					streamId: row.streamId,
					sequence: row.sequence,
				};

				if (!result.has(row.streamId)) {
					result.set(row.streamId, []);
				}
				result.get(row.streamId)!.push(event);
			}

			return Promise.resolve(right(result));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteEventStoreError(error.message)));
		}
	}

	close(): void {
		this.#db.close();
	}
}
