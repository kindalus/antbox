import postgres from "npm:postgres";

import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export class PostgresEventStoreError extends AntboxError {
	static ERROR_CODE = "PostgresEventStoreError";
	constructor(message: string) {
		super(PostgresEventStoreError.ERROR_CODE, message);
	}
}

/**
 * Postgres-backed EventStoreRepository.
 *
 * @remarks
 * External setup:
 * - Provision a Postgres database and ensure the `uuid-ossp` extension is available.
 * - Grant the configured user permission to create extensions and tables.
 * - Set `DATABASE_URL` or pass a connection string.
 *
 * @example
 * const store = new PostgresEventStoreRepository("postgres://user:pass@host/db");
 * await store.initialize();
 */
export class PostgresEventStoreRepository implements EventStoreRepository {
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
			return left(new PostgresEventStoreError(error.message));
		}
	}

	#sanitizeMimetype(mimetype: string): string {
		return mimetype.replace(/[^a-zA-Z0-9]/g, "_");
	}

	#getTableName(mimetype: string): string {
		return `events_${this.#sanitizeMimetype(mimetype)}`;
	}

	async #ensureTable(mimetype: string): Promise<void> {
		const tableName = this.#getTableName(mimetype);

		if (this.#existingTables.has(tableName)) {
			return;
		}

		await this.#sql.unsafe(`
			CREATE TABLE IF NOT EXISTS ${tableName} (
				stream_id TEXT NOT NULL,
				sequence INTEGER NOT NULL,
				event_type TEXT NOT NULL,
				user_email TEXT NOT NULL,
				payload JSONB NOT NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				PRIMARY KEY (stream_id, sequence)
			)
		`);

		await this.#sql.unsafe(`
			CREATE INDEX IF NOT EXISTS idx_${tableName}_stream
			ON ${tableName}(stream_id, sequence)
		`);

		this.#existingTables.add(tableName);
	}

	async append(
		streamId: string,
		mimetype: string,
		event: Omit<AuditEvent, "streamId" | "sequence">,
	): Promise<Either<AntboxError, void>> {
		try {
			await this.#ensureTable(mimetype);
			const tableName = this.#getTableName(mimetype);

			// Get next sequence number
			const seqResult = await this.#sql.unsafe<{ next_seq: number }[]>(
				`SELECT COALESCE(MAX(sequence), -1) + 1 as next_seq
				 FROM ${tableName}
				 WHERE stream_id = $1`,
				[streamId],
			);

			const sequence = seqResult[0]?.next_seq ?? 0;

			await this.#sql.unsafe(
				`INSERT INTO ${tableName} (stream_id, sequence, event_type, user_email, payload, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					streamId,
					sequence,
					event.eventType,
					event.userEmail,
					JSON.stringify(event),
					event.occurredOn,
				],
			);

			return right(undefined);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresEventStoreError(error.message));
		}
	}

	async getStream(
		streamId: string,
		mimetype: string,
	): Promise<Either<AntboxError, AuditEvent[]>> {
		try {
			await this.#ensureTable(mimetype);
			const tableName = this.#getTableName(mimetype);

			const rows = await this.#sql.unsafe<
				{
					stream_id: string;
					sequence: number;
					event_type: string;
					user_email: string;
					payload: Record<string, unknown>;
					created_at: string;
				}[]
			>(
				`SELECT stream_id, sequence, event_type, user_email, payload, created_at
				 FROM ${tableName}
				 WHERE stream_id = $1
				 ORDER BY sequence`,
				[streamId],
			);

			const events: AuditEvent[] = rows.map((row) => {
				const eventData = row.payload as Omit<AuditEvent, "streamId" | "sequence">;
				return {
					...eventData,
					streamId: row.stream_id,
					sequence: row.sequence,
					eventType: row.event_type,
					userEmail: row.user_email,
				};
			});

			return right(events);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresEventStoreError(error.message));
		}
	}

	async getStreamsByMimetype(
		mimetype: string,
	): Promise<Either<AntboxError, Map<string, AuditEvent[]>>> {
		try {
			await this.#ensureTable(mimetype);
			const tableName = this.#getTableName(mimetype);

			const rows = await this.#sql.unsafe<
				{
					stream_id: string;
					sequence: number;
					event_type: string;
					user_email: string;
					payload: Record<string, unknown>;
					created_at: string;
				}[]
			>(
				`SELECT stream_id, sequence, event_type, user_email, payload, created_at
				 FROM ${tableName}
				 ORDER BY stream_id, sequence`,
			);

			const result = new Map<string, AuditEvent[]>();

			for (const row of rows) {
				const eventData = row.payload as Omit<AuditEvent, "streamId" | "sequence">;
				const event: AuditEvent = {
					...eventData,
					streamId: row.stream_id,
					sequence: row.sequence,
					eventType: row.event_type,
					userEmail: row.user_email,
				};

				if (!result.has(row.stream_id)) {
					result.set(row.stream_id, []);
				}
				result.get(row.stream_id)!.push(event);
			}

			return right(result);
		} catch (err) {
			const error = err as Error;
			return left(new PostgresEventStoreError(error.message));
		}
	}

	async close(): Promise<void> {
		await this.#sql.end();
	}
}
