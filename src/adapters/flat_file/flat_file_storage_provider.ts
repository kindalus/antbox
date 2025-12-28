import { type StorageProvider } from "application/nodes/storage_provider.ts";
import { NodeFileNotFoundError } from "domain/nodes/node_file_not_found_error.ts";

import { join } from "path";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type Event } from "shared/event.ts";
import { type EventHandler } from "shared/event_handler.ts";
import { fileExistsSync } from "shared/os_helpers.ts";

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
			Deno.mkdirSync(this.#path, { recursive: true });
		}
	}

	async read(uuid: string): Promise<Either<AntboxError, File>> {
		try {
			const filePath = this.#buildFilePath(uuid);
			const mimetype = this.#readMimetype(uuid);

			const b = await Deno.readFile(filePath);
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
			await Deno.remove(path);
			if (fileExistsSync(mimetypePath)) {
				await Deno.remove(mimetypePath);
			}
			return right(undefined);
		} catch (e) {
			const err = error(uuid, (e as Record<string, string>).message);
			return left(new NodeFileNotFoundError(err as unknown as string));
		}
	}

	async write(
		uuid: string,
		file: File,
		_opts?: never,
	): Promise<Either<AntboxError, void>> {
		const folderPath = this.#buildFileFolderPath(uuid);
		const filePath = this.#buildFilePath(uuid);
		const mimetypePath = this.#buildMimetypePath(uuid);

		if (!fileExistsSync(folderPath)) {
			Deno.mkdirSync(folderPath, { recursive: true });
		}

		try {
			const buffer = new Uint8Array(await file.arrayBuffer());
			await Deno.writeFile(filePath, buffer, {});
			await Deno.writeTextFile(mimetypePath, file.type ?? "");
			return right(undefined);
		} catch (e) {
			return left(error(uuid, (e as Error).message));
		}
	}

	list(): Promise<string[]> {
		const files = [...Deno.readDirSync(this.#path)]
			.map((file) => join(this.#path, file.name));

		return Promise.resolve(files);
	}

	startListeners(
		_bus: (eventId: string, handler: EventHandler<Event>) => void,
	): void {}

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

		return Deno.readTextFileSync(mimetypePath).trim();
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
