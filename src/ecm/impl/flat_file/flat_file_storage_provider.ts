import * as fs from "fs";
import * as path from "path";

import buffer from "buffer";

import StorageProvider from "../../storage_provider.js";

export default class FlatFileStorageProvider implements StorageProvider {
	/**
	 *
	 * @param path Raíz do repositorio de ficheiros
	 */
	constructor(readonly path: string) {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path, { recursive: true });
		}
	}

	async read(uuid: string): Promise<Blob> {
		const filePath = this.buildFilePath(uuid);

		const fileContent = fs.readFileSync(filePath);

		const file = new buffer.Blob([fileContent]);

		return file as Blob;
	}

	async delete(uuid: string): Promise<void> {
		return fs.rmSync(this.buildFileFolderPath(uuid), { recursive: true, force: true });
	}

	async write(uuid: string, file: buffer.Blob): Promise<void> {
		const folderPath = this.buildFileFolderPath(uuid);
		const filePath = this.buildFilePath(uuid);

		if (!fs.existsSync(folderPath)) {
			fs.mkdirSync(folderPath, { recursive: true });
		}

		const buffer = Buffer.from(await file.arrayBuffer());

		fs.writeFileSync(filePath, buffer, {});

		return Promise.resolve(undefined);
	}

	async list(): Promise<string[]> {
		return Promise.resolve(fs.readdirSync(this.path));
	}

	private buildFileFolderPath(uuid: string) {
		const [l1, l2] = uuid;
		return path.join(this.path, l1.toUpperCase(), l2.toUpperCase(), uuid);
	}

	private buildFilePath(uuid: string) {
		return path.join(this.buildFileFolderPath(uuid), "current");
	}
}
