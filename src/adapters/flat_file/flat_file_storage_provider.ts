import { join } from "/deps/path";
import { fileExistsSync } from "/shared/file_exists_sync.ts";
import { StorageProvider } from "/domain/providers/storage_provider.ts";

export class FlatFileStorageProvider implements StorageProvider {
  /**
   * @param path Raíz do repositorio de ficheiros
   */
  constructor(readonly path: string) {
    if (!fileExistsSync(path)) {
      Deno.mkdirSync(path, { recursive: true });
    }
  }

  read(uuid: string): Promise<Blob> {
    const filePath = this.buildFilePath(uuid);

    const fileContent = Deno.readFileSync(filePath);

    const file = new Blob([fileContent]);

    return Promise.resolve(file);
  }

  delete(uuid: string): Promise<void> {
    return Deno.remove(this.buildFileFolderPath(uuid), {
      recursive: true,
    });
  }

  async write(uuid: string, file: Blob): Promise<void> {
    const folderPath = this.buildFileFolderPath(uuid);
    const filePath = this.buildFilePath(uuid);

    if (!fileExistsSync(folderPath)) {
      Deno.mkdirSync(folderPath, { recursive: true });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());

    Deno.writeFileSync(filePath, buffer, {});

    return Promise.resolve(undefined);
  }

  list(): Promise<string[]> {
    const files = [...Deno.readDirSync(this.path)].map((file) => file.name);
    return Promise.resolve(files);
  }

  private buildFileFolderPath(uuid: string) {
    const [l1, l2] = uuid;
    return join(this.path, l1.toUpperCase(), l2.toUpperCase(), uuid);
  }

  private buildFilePath(uuid: string) {
    return join(this.buildFileFolderPath(uuid), "current");
  }
}
