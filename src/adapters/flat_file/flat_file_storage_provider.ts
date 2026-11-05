import { type StorageProvider } from "application/nodes/storage_provider.ts";
import { NodeFileNotFoundError } from "domain/nodes/node_file_not_found_error.ts";

import fs from "node:fs/promises";
import fsSync from "node:fs";
import { join } from "node:path";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type Event } from "shared/event.ts";
import { type EventHandler } from "shared/event_handler.ts";
import { fileExistsSync } from "shared/os_helpers.ts";
import { fileMimetype } from "shared/mimetype.ts";
import { tempPath } from "shared/temp_path.ts";

/**
 * Builds a file-backed StorageProvider that stores files under `baseDir`.
 *
 * @remarks
 * External setup:
 * - Ensure `baseDir` is writable and persisted.
 * - The process needs read and write access to the data path.
 *
 * @example
 * const storageOrErr = await buildFlatFileStorageProvider("/var/lib/antbox");
 * if (storageOrErr.isRight()) {
 *   const storage = storageOrErr.value;
 * }
 */
export default function buildFlatFileStorageProvider(
	baseDir: string,
): Promise<Either<AntboxError, StorageProvider>> {
	return Promise.resolve(right(new FlatFileStorageProvider(baseDir)));
}

class FlatFileStorageProvider implements StorageProvider {
	readonly #path: string;

	/**
	 * @param baseDir Raíz do repositorio de ficheiros
	 */
	constructor(baseDir: string) {
		this.#path = baseDir;

		if (!fileExistsSync(this.#path)) {
			fsSync.mkdirSync(this.#path, { recursive: true });
		}
	}

	async read(uuid: string): Promise<Either<AntboxError, File>> {
		try {
			const filePath = this.#buildFilePath(uuid);
			const mimetype = this.#readMimetype(uuid);

			const b = await fs.readFile(filePath);
			const a = new File([b], uuid, { type: mimetype });

			return right(a);
		} catch (e) {
			const err = error(uuid, (e as Record<string, string>).message);
			return left(new NodeFileNotFoundError(err as unknown as string));
		}
	}

	async delete(uuid: string): Promise<Either<AntboxError, void>> {
		const path = this.#buildFilePath(uuid);
		const mimetypePath = this.#buildMimetypePath(uuid);

		try {
			await fs.unlink(path);
			if (fileExistsSync(mimetypePath)) {
				await fs.unlink(mimetypePath);
			}
			return right(undefined);
		} catch (e) {
			const err = error(uuid, (e as Record<string, string>).message);
			return left(new NodeFileNotFoundError(err as unknown as string));
		}
	}

	mkdir(_uuid: string): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	rmdir(_uuid: string): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	async write(
		uuid: string,
		file: File,
		_opts?: never,
	): Promise<Either<AntboxError, void>> {
		let temporaryPath: string | undefined;
		try {
			const folderPath = this.#buildFileFolderPath(uuid);
			const filePath = this.#buildFilePath(uuid);
			const mimetypePath = this.#buildMimetypePath(uuid);
			fsSync.mkdirSync(folderPath, { recursive: true });

			const buffer = new Uint8Array(await file.arrayBuffer());
			temporaryPath = tempPath(folderPath, ".content-");
			await fs.writeFile(temporaryPath, buffer);
			await fs.rename(temporaryPath, filePath);
			temporaryPath = undefined;
			// Content is committed here; a sidecar failure cannot roll it back.
			await fs.writeFile(mimetypePath, fileMimetype(file));
			return right(undefined);
		} catch (e) {
			return left(error(uuid, (e as Error).message));
		} finally {
			if (temporaryPath) await fs.unlink(temporaryPath).catch(() => undefined);
		}
	}

	list(): Promise<string[]> {
		const files = fsSync.readdirSync(this.#path)
			.map((name) => join(this.#path, name));

		return Promise.resolve(files);
	}

	startListeners(
		_bus: (eventId: string, handler: EventHandler<Event>) => void,
	): void {}

	provideCDN(): boolean {
		return false;
	}

	getCDNUrl(_uuid: string): string | undefined {
		return undefined;
	}

	#buildFileFolderPath(uuid: string) {
		const [l1, l2] = uuid;
		return join(this.#path, l1.toUpperCase(), l2.toUpperCase());
	}

	#buildFilePath(uuid: string) {
		return join(this.#buildFileFolderPath(uuid), uuid);
	}

	#buildMimetypePath(uuid: string) {
		return join(this.#buildFileFolderPath(uuid), `${uuid}.mimetype`);
	}

	#readMimetype(uuid: string): string {
		const mimetypePath = this.#buildMimetypePath(uuid);
		if (!fileExistsSync(mimetypePath)) {
			return "";
		}

		return fsSync.readFileSync(mimetypePath, "utf-8").trim();
	}
}

class FlatFileStorageProviderError extends AntboxError {
	constructor(message: string) {
		super("FlatFileStorageProviderError", message);
	}
}

function error(uuid: string, message: string) {
	return new FlatFileStorageProviderError(`[${uuid}] ${message}`);
}
