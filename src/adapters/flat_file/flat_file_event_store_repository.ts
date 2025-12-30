import { InMemoryEventStoreRepository } from "adapters/inmem/inmem_event_store_repository.ts";
import type { AuditEvent } from "domain/audit/audit_event.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import { join } from "path";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { copyFile, fileExistsSync } from "shared/os_helpers.ts";
import { Logger } from "shared/logger.ts";

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
		try {
			for (const entry of Deno.readDirSync(this.#eventsDir)) {
				if (entry.isDirectory) {
					const mimetype = this.#decodeMimetypeDirName(entry.name);
					const mimetypeDir = join(this.#eventsDir, entry.name);

					for (const streamFile of Deno.readDirSync(mimetypeDir)) {
						if (streamFile.isFile && streamFile.name.endsWith(".json")) {
							const streamId = streamFile.name.replace(".json", "");
							const streamPath = join(mimetypeDir, streamFile.name);
							const streamBackupPath = join(mimetypeDir, `${streamFile.name}.backup`);

							try {
								const data = Deno.readTextFileSync(streamPath);
								const events: AuditEvent[] = JSON.parse(data);

								copyFile(streamPath, streamBackupPath);

								const mimetypeStreams = this.#base.streamsByMimetype.get(mimetype) ||
									new Map();
								mimetypeStreams.set(streamId, events);
								this.#base.streamsByMimetype.set(mimetype, mimetypeStreams);
							} catch (err) {
								Logger.error(
									`Error loading stream ${streamId} for mimetype ${mimetype}:`,
									err,
								);
							}
						}
					}
				}
			}
		} catch (err) {
			Logger.error("Error loading event streams:", err);
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
			copyFile(streamPath, streamBackupPath);
		}

		const rawData = this.#encoder.encode(JSON.stringify(events, null, 2));
		Deno.writeFileSync(streamPath, rawData);
	}

	async append(
		streamId: string,
		mimetype: string,
		event: Omit<AuditEvent, "streamId" | "sequence">,
	): Promise<Either<AntboxError, void>> {
		try {
			const result = await this.#base.append(streamId, mimetype, event);

			if (result.isRight()) {
				const streamResult = await this.#base.getStream(streamId, mimetype);
				if (streamResult.isRight()) {
					this.#saveStream(streamId, mimetype, streamResult.value);
				}
			}

			return result;
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
