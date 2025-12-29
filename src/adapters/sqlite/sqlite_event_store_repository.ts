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
				stream_id TEXT NOT NULL,
				sequence INTEGER NOT NULL,
				event_type TEXT GENERATED ALWAYS AS (json_extract(payload, '$.eventType')) STORED,
				user_email TEXT GENERATED ALWAYS AS (json_extract(payload, '$.userEmail')) STORED,
				payload JSON NOT NULL,
				timestamp TEXT GENERATED ALWAYS AS (json_extract(payload, '$.occurredOn')) STORED,
				PRIMARY KEY (stream_id, sequence)
			);
		`);

		this.#db.exec(`
			CREATE INDEX IF NOT EXISTS idx_${tableName}_stream
			ON ${tableName}(stream_id, sequence);
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
					`SELECT COALESCE(MAX(sequence), -1) + 1 as nextSeq FROM ${tableName} WHERE stream_id = ?`,
				)
				.get(streamId) as { nextSeq: number };

			const sequence = sequenceRow.nextSeq;
			const payload = JSON.stringify(event);

			this.#db.exec(
				`INSERT INTO ${tableName} (stream_id, sequence, payload) VALUES (?, ?, ?)`,
				[streamId, sequence, payload],
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
					`SELECT stream_id, sequence, payload FROM ${tableName} WHERE stream_id = ? ORDER BY sequence`,
				)
				.all(streamId) as {
					stream_id: string;
					sequence: number;
					payload: string;
				}[];

			const events: AuditEvent[] = rows.map((row) => {
				const eventData = JSON.parse(row.payload) as Omit<AuditEvent, "streamId" | "sequence">;
				return {
					...eventData,
					streamId: row.stream_id,
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
					`SELECT stream_id, sequence, payload FROM ${tableName} ORDER BY stream_id, sequence`,
				)
				.all() as {
					stream_id: string;
					sequence: number;
					payload: string;
				}[];

			const result = new Map<string, AuditEvent[]>();

			for (const row of rows) {
				const eventData = JSON.parse(row.payload) as Omit<AuditEvent, "streamId" | "sequence">;
				const event: AuditEvent = {
					...eventData,
					streamId: row.stream_id,
					sequence: row.sequence,
				};

				if (!result.has(row.stream_id)) {
					result.set(row.stream_id, []);
				}
				result.get(row.stream_id)!.push(event);
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
