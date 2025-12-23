import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import { type Either, right } from "shared/either.ts";

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
		if (!this.#streams.has(mimetype)) {
			this.#streams.set(mimetype, new Map());
		}

		const mimetypeStreams = this.#streams.get(mimetype)!;

		if (!mimetypeStreams.has(streamId)) {
			mimetypeStreams.set(streamId, []);
		}

		const stream = mimetypeStreams.get(streamId)!;
		const sequence = stream.length;

		const auditEvent: AuditEvent = {
			...event,
			streamId,
			sequence,
		};

		stream.push(auditEvent);

		return Promise.resolve(right(undefined));
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

		return Promise.resolve(right([...stream]));
	}

	async getStreamsByMimetype(
		mimetype: string,
	): Promise<Either<AntboxError, Map<string, AuditEvent[]>>> {
		const mimetypeStreams = this.#streams.get(mimetype);

		if (!mimetypeStreams) {
			return Promise.resolve(right(new Map()));
		}

		const result = new Map<string, AuditEvent[]>();
		for (const [streamId, events] of mimetypeStreams.entries()) {
			result.set(streamId, [...events]);
		}

		return Promise.resolve(right(result));
	}

	get streamsByMimetype(): Map<string, Map<string, AuditEvent[]>> {
		return this.#streams;
	}
}
