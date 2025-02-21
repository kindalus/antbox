import { join } from "jsr:@std/path";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, left, right } from "../../shared/either.ts";
import { Event } from "../../shared/event.ts";
import { EventHandler } from "../../shared/event_handler.ts";
import { fileExistsSync } from "../../shared/file_exists_sync.ts";
import { StorageProvider } from "../../application/storage_provider.ts";

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

	read(uuid: string): Promise<Either<AntboxError, File>> {
		const path = this.#buildFilePath(uuid);

		return Deno.readFile(path)
			.then((fileContent) => new File([fileContent], uuid))
			.then(right)
			.catch((e) => left(error(uuid, e.message))) as Promise<Either<AntboxError, File>>;
	}

	delete(uuid: string): Promise<Either<AntboxError, void>> {
		const path = this.#buildFilePath(uuid);

		return Deno.remove(path)
			.then(right)
			.catch((e) => left(error(uuid, e.message))) as Promise<Either<AntboxError, void>>;
	}

	write(uuid: string, file: File, _opt: never): Promise<Either<AntboxError, void>> {
		const folderPath = this.#buildFileFolderPath(uuid);
		const filePath = this.#buildFilePath(uuid);

		if (!fileExistsSync(folderPath)) {
			Deno.mkdirSync(folderPath, { recursive: true });
		}

		return file.arrayBuffer()
			.then((buffer) => new Uint8Array(buffer))
			.then((buffer) => Deno.writeFileSync(filePath, buffer, {}))
			.then(right)
			.catch((e) => left(error(uuid, e.message))) as Promise<Either<AntboxError, void>>;
	}

	list(): Promise<string[]> {
		const files = [...Deno.readDirSync(this.#path)].map((file) => file.name);
		return Promise.resolve(files);
	}

	startListeners(_bus: (eventId: string, handler: EventHandler<Event>) => void): void {
	}

	#buildFileFolderPath(uuid: string) {
		const [l1, l2] = uuid;
		return join(this.#path, l1.toUpperCase(), l2.toUpperCase());
	}

	#buildFilePath(uuid: string) {
		return join(this.#buildFileFolderPath(uuid), uuid);
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
