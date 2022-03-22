import { join } from "../../../deps.ts";
import fileExistsSync from "../../shared/file_exists_sync.ts";
import { Aspect } from "../../ecm/aspects/aspect.ts";
import { AspectRepository } from "../../ecm/aspects/aspect_repository.ts";
import jsonToUint8Array from "../../shared/json_to_uint_8_array.ts";

export default class FlatFileAspectRepository implements AspectRepository {
	/**
	 * @param path Raíz do repositorio de ficheiros
	 */
	constructor(readonly path: string) {
		if (!fileExistsSync(path)) {
			Deno.mkdirSync(path, { recursive: true });
		}
	}

	get(uuid: string): Promise<Aspect> {
		const filePath = this.buildFilePath(uuid);

		const decoder = new TextDecoder("utf-8");
		const buffer = Deno.readFileSync(filePath);

		const aspectString = decoder.decode(buffer);
		const aspect = JSON.parse(aspectString) as unknown as Aspect;

		return Promise.resolve(aspect);
	}

	delete(uuid: string): Promise<void> {
		return Deno.remove(this.buildFilePath(uuid), { recursive: true });
	}

	addOrReplace(aspect: Aspect): Promise<void> {
		const filePath = this.buildFilePath(aspect.uuid);

		if (!fileExistsSync(this.path)) {
			Deno.mkdirSync(this.path, { recursive: true });
		}

		return jsonToUint8Array(aspect)
			.then((data: Uint8Array) => Deno.writeFileSync(filePath, data));
	}

	getAll(): Promise<Aspect[]> {
		const files = Deno.readDirSync(this.path);

		const readPromises = [];

		for (const file of files) {
			readPromises.push(this.get(file.name.slice(0, -5)));
		}

		return Promise.all(readPromises);
	}

	private buildFilePath(uuid: string) {
		return join(this.path, uuid.concat(".json"));
	}
}
