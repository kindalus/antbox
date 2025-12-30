import { MongoClient } from "mongodb";

import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

interface EventDocument {
	streamId: string;
	sequence: number;
	payload: Omit<AuditEvent, "streamId" | "sequence">;
	createdAt: Date;
}

export class MongodbEventStoreError extends AntboxError {
	static ERROR_CODE = "MongodbEventStoreError";
	constructor(message: string) {
		super(MongodbEventStoreError.ERROR_CODE, message);
	}
}

/**
 * Builds a MongoDB-backed EventStoreRepository.
 *
 * @remarks
 * External setup:
 * - Start a MongoDB server and create a database/user with read/write access.
 * - Ensure the process can reach MongoDB (`--allow-net` in Deno).
 *
 * @example
 * const storeOrErr = await buildMongodbEventStoreRepository("mongodb://localhost:27017", "antbox");
 * if (storeOrErr.isRight()) {
 *   const store = storeOrErr.value;
 * }
 */
export default function buildMongodbEventStoreRepository(
	url: string,
	dbname: string,
): Promise<Either<AntboxError, EventStoreRepository>> {
	return new MongoClient(url)
		.connect()
		.then((client) => new MongodbEventStoreRepository(client, dbname))
		.then((repo) => right(repo))
		.catch((err) => left(new UnknownError(err.message))) as Promise<
			Either<AntboxError, EventStoreRepository>
		>;
}

export class MongodbEventStoreRepository implements EventStoreRepository {
	readonly #client: MongoClient;
	readonly #db: string;

	constructor(client: MongoClient, dbname: string) {
		this.#client = client;
		this.#db = dbname;
	}

	#sanitizeMimetype(mimetype: string): string {
		return mimetype.replace(/[^a-zA-Z0-9]/g, "_");
	}

	#getCollectionName(mimetype: string): string {
		return `events_${this.#sanitizeMimetype(mimetype)}`;
	}

	#getCollection(mimetype: string) {
		const collectionName = this.#getCollectionName(mimetype);
		return this.#client.db(this.#db).collection<EventDocument>(collectionName);
	}

	async append(
		streamId: string,
		mimetype: string,
		event: Omit<AuditEvent, "streamId" | "sequence">,
	): Promise<Either<AntboxError, void>> {
		try {
			const collection = this.#getCollection(mimetype);

			// Get next sequence number
			const lastEvent = await collection
				.find({ streamId })
				.sort({ sequence: -1 })
				.limit(1)
				.toArray();

			const sequence = lastEvent.length > 0 ? lastEvent[0].sequence + 1 : 0;

			await collection.insertOne({
				streamId,
				sequence,
				payload: event,
				createdAt: new Date(event.occurredOn),
			});

			// Ensure index for efficient queries
			await collection.createIndex(
				{ streamId: 1, sequence: 1 },
				{ unique: true },
			);

			return right(undefined);
		} catch (err) {
			const error = err as Error;
			return left(new MongodbEventStoreError(error.message));
		}
	}

	async getStream(
		streamId: string,
		mimetype: string,
	): Promise<Either<AntboxError, AuditEvent[]>> {
		try {
			const collection = this.#getCollection(mimetype);

			const docs = await collection
				.find({ streamId })
				.sort({ sequence: 1 })
				.toArray();

			const events: AuditEvent[] = docs.map((doc) => ({
				...doc.payload,
				streamId: doc.streamId,
				sequence: doc.sequence,
			}));

			return right(events);
		} catch (err) {
			const error = err as Error;
			return left(new MongodbEventStoreError(error.message));
		}
	}

	async getStreamsByMimetype(
		mimetype: string,
	): Promise<Either<AntboxError, Map<string, AuditEvent[]>>> {
		try {
			const collection = this.#getCollection(mimetype);

			const docs = await collection
				.find({})
				.sort({ streamId: 1, sequence: 1 })
				.toArray();

			const result = new Map<string, AuditEvent[]>();

			for (const doc of docs) {
				const event: AuditEvent = {
					...doc.payload,
					streamId: doc.streamId,
					sequence: doc.sequence,
				};

				if (!result.has(doc.streamId)) {
					result.set(doc.streamId, []);
				}
				result.get(doc.streamId)!.push(event);
			}

			return right(result);
		} catch (err) {
			const error = err as Error;
			return left(new MongodbEventStoreError(error.message));
		}
	}

	async close(): Promise<void> {
		await this.#client.close();
	}
}
