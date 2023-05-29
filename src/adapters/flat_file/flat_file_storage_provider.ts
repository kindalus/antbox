import { join } from "../../../deps.ts";
import { StorageProvider } from "../../domain/providers/storage_provider.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, right } from "../../shared/either.ts";
import { fileExistsSync } from "../../shared/file_exists_sync.ts";

export default function buildFlatFileStorageProvider(
	baseDir: string,
): Promise<Either<AntboxError, StorageProvider>> {
	return Promise.resolve(right(new FlatFileStorageProvider(baseDir)));
}

export class FlatFileStorageProvider implements StorageProvider {
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

	read(uuid: string): Promise<File> {
		const filePath = this.#buildFilePath(uuid);

		const fileContent = Deno.readFileSync(filePath);

		const file = new File([fileContent], uuid);

		return Promise.resolve(file);
	}

	delete(uuid: string): Promise<void> {
		return Deno.remove(this.#buildFilePath(uuid), {
			recursive: true,
		});
	}

	async write(uuid: string, file: File): Promise<void> {
		const folderPath = this.#buildFileFolderPath(uuid);
		const filePath = this.#buildFilePath(uuid);

		if (!fileExistsSync(folderPath)) {
			Deno.mkdirSync(folderPath, { recursive: true });
		}

		const buffer = new Uint8Array(await file.arrayBuffer());

		Deno.writeFileSync(filePath, buffer, {});

		return Promise.resolve(undefined);
	}

	list(): Promise<string[]> {
		const files = [...Deno.readDirSync(this.#path)].map((file) => file.name);
		return Promise.resolve(files);
	}

	#buildFileFolderPath(uuid: string) {
		const [l1, l2] = uuid;
		return join(this.#path, l1.toUpperCase(), l2.toUpperCase());
	}

	#buildFilePath(uuid: string) {
		return join(this.#buildFileFolderPath(uuid), uuid);
	}
}
