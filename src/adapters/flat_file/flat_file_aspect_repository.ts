import { join } from "/deps/path";
import { Aspect } from "/domain/aspects/aspect.ts";
import AspectRepository from "/domain/aspects/aspect_repository.ts";
import FlatFileRepository from "./flat_file_repository.ts";

export default class FlatFileAspectRepository implements AspectRepository {
  readonly repo: FlatFileRepository<Aspect>;

  /**
   * @param path Raíz do repositorio de ficheiros
   */
  constructor(readonly path: string) {
    const buildFilePath = (uuid: string) => join(path, uuid.concat(".json"));

    this.repo = new FlatFileRepository(
      path,
      buildFilePath,
      toUint8Array,
      fromUint8Array
    );
  }

  get(uuid: string): Promise<Aspect> {
    return this.repo.get(uuid);
  }

  delete(uuid: string): Promise<void> {
    return this.repo.delete(uuid);
  }

  addOrReplace(aspect: Aspect): Promise<void> {
    return this.repo.addOrReplace(aspect);
  }

  getAll(): Promise<Aspect[]> {
    return this.repo.getAll();
  }
}

function toUint8Array(data: Aspect): Promise<Uint8Array> {
  const blob = new Blob([JSON.stringify(data)]);

  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function fromUint8Array(data: Uint8Array): Promise<Aspect> {
  const decoder = new TextDecoder("utf-8");
  const aspectString = decoder.decode(data);

  return Promise.resolve(JSON.parse(aspectString) as unknown as Aspect);
}
