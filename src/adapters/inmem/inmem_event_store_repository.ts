import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import { type AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

/**
 * Builds an in-memory EventStoreRepository.
 *
 * @remarks
 * External setup: none. Streams are lost when the process exits.
 *
 * @example
 * const storeOrErr = await buildInmemEventStoreRepository();
 * if (storeOrErr.isRight()) {
 *   const store = storeOrErr.value;
 * }
 */
export default function buildInmemEventStoreRepository(): Promise<
	Either<AntboxError, EventStoreRepository>
> {
	return Promise.resolve(right(new InMemoryEventStoreRepository()));
}

export class InMemoryEventStoreRepository implements EventStoreRepository {
	readonly #streams: Map<string, Map<string, AuditEvent[]>>;

	constructor() {
		this.#streams = new Map();
	}

	async append(
		streamId: string,
		mimetype: string,
		event: Omit<AuditEvent, "streamId" | "sequence">,
	): Promise<Either<AntboxError, void>> {
		try {
			const mimetypeStreams = this.#streams.get(mimetype) ?? new Map();
			const stream = mimetypeStreams.get(streamId) ?? [];
			const auditEvent = structuredClone({ ...event, streamId, sequence: stream.length });
			stream.push(auditEvent);
			mimetypeStreams.set(streamId, stream);
			this.#streams.set(mimetype, mimetypeStreams);
			return right(undefined);
		} catch (error) {
			return left(new UnknownError((error as Error).message));
		}
	}

	async getStream(
		streamId: string,
		mimetype: string,
	): Promise<Either<AntboxError, AuditEvent[]>> {
		const mimetypeStreams = this.#streams.get(mimetype);

		if (!mimetypeStreams) {
			return Promise.resolve(right([]));
		}

		const stream = mimetypeStreams.get(streamId);

		if (!stream) {
			return Promise.resolve(right([]));
		}

		return Promise.resolve(right(structuredClone(stream)));
	}

	async getStreamsByMimetype(
		mimetype: string,
	): Promise<Either<AntboxError, Map<string, AuditEvent[]>>> {
		const mimetypeStreams = this.#streams.get(mimetype);

		if (!mimetypeStreams) {
			return Promise.resolve(right(new Map()));
		}

		return Promise.resolve(right(structuredClone(mimetypeStreams)));
	}

	get streamsByMimetype(): Map<string, Map<string, AuditEvent[]>> {
		return this.#streams;
	}
}
