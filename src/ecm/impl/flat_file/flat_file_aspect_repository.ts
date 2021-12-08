import * as fs from "fs";
import * as path from "path";

import { Aspect } from "../../aspect";
import AspectRepository from "../../aspect_repository";

export default class FlatFileAspectRepository implements AspectRepository {
	/**
	 *
	 * @param path Raíz do repositorio de ficheiros
	 */
	constructor(readonly path: string) {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path, { recursive: true });
		}
	}

	async get(uuid: string): Promise<Aspect> {
		const filePath = this.buildFilePath(uuid);

		const buffer = fs.readFileSync(filePath, { encoding: "utf8" });

		return Promise.resolve(JSON.parse(buffer) as unknown as Aspect);
	}

	async delete(uuid: string): Promise<void> {
		return fs.rmSync(this.buildFilePath(uuid), { recursive: true, force: true });
	}

	async addOrReplace(aspect: Aspect): Promise<void> {
		const filePath = this.buildFilePath(aspect.uuid);

		if (!fs.existsSync(this.path)) {
			fs.mkdirSync(this.path, { recursive: true });
		}

		const buffer = Buffer.from(JSON.stringify(aspect), "utf8");

		fs.writeFileSync(filePath, buffer);

		return undefined;
	}

	getAll(): Promise<Aspect[]> {
		const files = fs.readdirSync(this.path);

		const race = files.map((file) => file.slice(0, -5)).map((file) => this.get(file));

		return Promise.all(race);
	}

	private buildFilePath(uuid: string) {
		return path.join(this.path, uuid.concat(".json"));
	}
}
