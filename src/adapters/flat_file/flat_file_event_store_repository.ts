import { InMemoryEventStoreRepository } from "adapters/inmem/inmem_event_store_repository.ts";
import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import fsSync from "node:fs";
import { join } from "node:path";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { fileExistsSync } from "shared/os_helpers.ts";
import { tempPath } from "shared/temp_path.ts";
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
 * - The process needs read and write access to the data path.
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
			fsSync.mkdirSync(eventsDir, { recursive: true });
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
		for (const entry of fsSync.readdirSync(this.#eventsDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) continue;
			const mimetype = this.#decodeMimetypeDirName(entry.name);
			const mimetypeDir = join(this.#eventsDir, entry.name);

			for (const streamFile of fsSync.readdirSync(mimetypeDir, { withFileTypes: true })) {
				if (!streamFile.isFile() || !streamFile.name.endsWith(".json")) continue;
				const streamId = streamFile.name.slice(0, -5);
				const streamPath = join(mimetypeDir, streamFile.name);
				const streamBackupPath = join(mimetypeDir, `${streamFile.name}.backup`);
				const events = AuditStreamSchema.parse(
					JSON.parse(fsSync.readFileSync(streamPath, "utf-8")),
				);

				fsSync.copyFileSync(streamPath, streamBackupPath);

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
			fsSync.mkdirSync(mimetypeDir, { recursive: true });
		}

		const streamPath = this.#getStreamPath(streamId, mimetype);
		const streamBackupPath = `${streamPath}.backup`;

		if (fileExistsSync(streamPath)) {
			fsSync.copyFileSync(streamPath, streamBackupPath);
		}

		const rawData = this.#encoder.encode(JSON.stringify(events, null, 2));
		const temporaryPath = tempPath(mimetypeDir, ".audit-");
		try {
			fsSync.writeFileSync(temporaryPath, rawData);
			fsSync.renameSync(temporaryPath, streamPath);
		} catch (err) {
			removeQuietly(temporaryPath);
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

function removeQuietly(path: string): void {
	try {
		fsSync.unlinkSync(path);
	} catch {
		// The original failure is the one worth reporting.
	}
}
