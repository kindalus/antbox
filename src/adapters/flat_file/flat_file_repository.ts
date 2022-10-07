import { path } from "https://deno.land/x/compress@v0.4.1/deps.ts";
import { join } from "/deps/path";
import { fileExistsSync } from "/shared/file_exists_sync.ts";

export class FlatFileRepository<T extends { uuid: string }> {
  /**
   * @param path Raíz do repositorio de ficheiros
   */
  constructor(
    readonly path: string,
    readonly buildFilePath: (uuid: string) => string,
    readonly toUint8Array: (value: T) => Promise<Uint8Array>,
    // Se não for passado faz o import dinamicamente
    readonly fromUint8Array?: (data: Uint8Array) => Promise<T>
  ) {
    if (!fileExistsSync(path)) {
      Deno.mkdirSync(path, { recursive: true });
    }
  }

  get(uuid: string): Promise<T> {
    const filePath = this.buildFilePath(uuid);

    return this.readToModel(filePath);
  }

  async readToModel(filepath: string): Promise<T> {
    if (this.fromUint8Array) {
      const buffer = Deno.readFileSync(filepath);
      return this.fromUint8Array(buffer);
    }

    try {
      const model = await import(filepath);
      return { uuid: path.parse(filepath).name, ...model.default };
    } catch (_err) {
      return null as unknown as T;
    }
  }

  delete(uuid: string): Promise<void> {
    return Deno.remove(this.buildFilePath(uuid), { recursive: true });
  }

  addOrReplace(data: T): Promise<void> {
    const filePath = this.buildFilePath(data.uuid);

    if (!fileExistsSync(this.path)) {
      Deno.mkdirSync(this.path, { recursive: true });
    }

    return this.toUint8Array(data).then((data: Uint8Array) => {
      Deno.writeFileSync(filePath, data, { create: true });
    });
  }

  async getAll(): Promise<T[]> {
    const files = Deno.readDirSync(this.path);

    const modelArray: T[] = [];

    for (const file of files) {
      if (file.isFile) {
        const filepath = join(this.path, file.name);

        try {
          const model = await this.readToModel(filepath);
          modelArray.push(model);
        } catch (err) {
          console.error(err);
        }
      }
    }

    return modelArray;
  }
}
