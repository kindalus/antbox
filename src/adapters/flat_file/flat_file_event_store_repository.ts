import { InMemoryEventStoreRepository } from "adapters/inmem/inmem_event_store_repository.ts";
import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import { join } from "path";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { fileExistsSync } from "shared/os_helpers.ts";
import { Logger } from "shared/logger.ts";
import { z } from "zod";

const AuditStreamSchema = z.array(
	z.object({
		streamId: z.string(),
		eventType: z.string(),
		occurredOn: z.string(),
		userEmail: z.string(),
		payload: z.unknown(),
		sequence: z.number().int().nonnegative(),
	}).passthrough(),
);

/**
 * Builds a file-backed EventStoreRepository that persists streams as JSON.
 *
 * @remarks
 * External setup:
 * - Ensure `baseDir` is writable and persisted.
 * - Deno requires `--allow-read` and `--allow-write` for file access.
 *
 * @example
 * const storeOrErr = await buildFlatFileEventStoreRepository("/var/lib/antbox");
 * if (storeOrErr.isRight()) {
 *   const store = storeOrErr.value;
 * }
 */
export default function buildFlatFileEventStoreRepository(
	baseDir: string,
): Promise<Either<AntboxError, EventStoreRepository>> {
	const eventsDir = join(baseDir, "events");

	try {
		if (!fileExistsSync(eventsDir)) {
			Deno.mkdirSync(eventsDir, { recursive: true });
		}

		const repository = new FlatFileEventStoreRepository(eventsDir);
		repository.loadAllStreams();

		return Promise.resolve(right(repository));
	} catch (err) {
		return Promise.resolve(left(new UnknownError(err as string)));
	}
}

class FlatFileEventStoreRepository implements EventStoreRepository {
	readonly #eventsDir: string;
	readonly #encoder: TextEncoder;
	readonly #base: InMemoryEventStoreRepository;

	constructor(eventsDir: string) {
		this.#eventsDir = eventsDir;
		this.#encoder = new TextEncoder();
		this.#base = new InMemoryEventStoreRepository();
	}

	loadAllStreams(): void {
		for (const entry of Deno.readDirSync(this.#eventsDir)) {
			if (!entry.isDirectory) continue;
			const mimetype = this.#decodeMimetypeDirName(entry.name);
			const mimetypeDir = join(this.#eventsDir, entry.name);

			for (const streamFile of Deno.readDirSync(mimetypeDir)) {
				if (!streamFile.isFile || !streamFile.name.endsWith(".json")) continue;
				const streamId = streamFile.name.slice(0, -5);
				const streamPath = join(mimetypeDir, streamFile.name);
				const streamBackupPath = join(mimetypeDir, `${streamFile.name}.backup`);
				const events = AuditStreamSchema.parse(JSON.parse(Deno.readTextFileSync(streamPath)));

				Deno.copyFileSync(streamPath, streamBackupPath);

				const mimetypeStreams = this.#base.streamsByMimetype.get(mimetype) || new Map();
				mimetypeStreams.set(streamId, events);
				this.#base.streamsByMimetype.set(mimetype, mimetypeStreams);
			}
		}
	}

	#encodeMimetypeDirName(mimetype: string): string {
		return mimetype.replace(/\//g, "_");
	}

	#decodeMimetypeDirName(dirName: string): string {
		return dirName.replace(/_/g, "/");
	}

	#getStreamPath(streamId: string, mimetype: string): string {
		const mimetypeDir = join(this.#eventsDir, this.#encodeMimetypeDirName(mimetype));
		return join(mimetypeDir, `${streamId}.json`);
	}

	#saveStream(streamId: string, mimetype: string, events: AuditEvent[]): void {
		const mimetypeDir = join(this.#eventsDir, this.#encodeMimetypeDirName(mimetype));

		if (!fileExistsSync(mimetypeDir)) {
			Deno.mkdirSync(mimetypeDir, { recursive: true });
		}

		const streamPath = this.#getStreamPath(streamId, mimetype);
		const streamBackupPath = `${streamPath}.backup`;

		if (fileExistsSync(streamPath)) {
			Deno.copyFileSync(streamPath, streamBackupPath);
		}

		const rawData = this.#encoder.encode(JSON.stringify(events, null, 2));
		const temporaryPath = Deno.makeTempFileSync({ dir: mimetypeDir, prefix: ".audit-" });
		try {
			Deno.writeFileSync(temporaryPath, rawData);
			Deno.renameSync(temporaryPath, streamPath);
		} catch (err) {
			Deno.removeSync(temporaryPath);
			throw err;
		}
	}

	async append(
		streamId: string,
		mimetype: string,
		event: Omit<AuditEvent, "streamId" | "sequence">,
	): Promise<Either<AntboxError, void>> {
		try {
			const mimetypeStreams = this.#base.streamsByMimetype.get(mimetype) || new Map();
			const previous = mimetypeStreams.get(streamId) ?? [];
			const auditEvent = structuredClone({ ...event, streamId, sequence: previous.length });
			const events = [...previous, auditEvent];
			this.#saveStream(streamId, mimetype, events);
			mimetypeStreams.set(streamId, events);
			this.#base.streamsByMimetype.set(mimetype, mimetypeStreams);
			return right(undefined);
		} catch (err) {
			Logger.error(`Error appending event to stream ${streamId}:`, err);
			return left(new UnknownError(err as string));
		}
	}

	async getStream(
		streamId: string,
		mimetype: string,
	): Promise<Either<AntboxError, AuditEvent[]>> {
		return this.#base.getStream(streamId, mimetype);
	}

	async getStreamsByMimetype(
		mimetype: string,
	): Promise<Either<AntboxError, Map<string, AuditEvent[]>>> {
		return this.#base.getStreamsByMimetype(mimetype);
	}
}
