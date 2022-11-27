import { join } from "/deps/path";
import { fileExistsSync } from "/shared/file_exists_sync.ts";
import { StorageProvider } from "/domain/providers/storage_provider.ts";

export class FlatFileStorageProvider implements StorageProvider {
  private static storageDir = "storage";
  private readonly path: string;

  /**
   * @param baseDir Raíz do repositorio de ficheiros
   */
  constructor(baseDir: string) {
    this.path = join(baseDir, FlatFileStorageProvider.storageDir);

    if (!fileExistsSync(this.path)) {
      Deno.mkdirSync(this.path, { recursive: true });
    }
  }

  read(uuid: string): Promise<File> {
    const filePath = this.buildFilePath(uuid);

    const fileContent = Deno.readFileSync(filePath);

    const file = new File([fileContent], uuid);

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
    return join(this.path, l1.toUpperCase(), l2.toUpperCase());
  }

  private buildFilePath(uuid: string) {
    return join(this.buildFileFolderPath(uuid), uuid);
  }
}
