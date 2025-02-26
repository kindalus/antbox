import path, { join } from "path";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type Event } from "shared/event.ts";
import { type EventHandler } from "shared/event_handler.ts";
import { fileExistsSync } from "shared/file_exists_sync.ts";
import { type StorageProvider } from "application/storage_provider.ts";
import { mkdirSync, readdirSync, writeFileSync } from "fs";

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
      mkdirSync(this.#path, { recursive: true });
    }
  }

  async read(uuid: string): Promise<Either<AntboxError, File>> {
    try {
      const filePath = this.#buildFilePath(uuid);
      const b = await Bun.file(filePath).bytes();
      const a = new File([b], uuid);
      return right(a);
    } catch (e) {
      const err = error(uuid, (e as Record<string, string>).message);
      return left(err);
    }
  }

  async delete(uuid: string): Promise<Either<AntboxError, void>> {
    const path = this.#buildFilePath(uuid);

    try {
      return right(await Bun.file(path).delete());
    } catch (e) {
      const err = error(uuid, (e as Record<string, string>).message);
      return left(err);
    }
  }

  write(
    uuid: string,
    file: File,
    _opt: never,
  ): Promise<Either<AntboxError, void>> {
    const folderPath = this.#buildFileFolderPath(uuid);
    const filePath = this.#buildFilePath(uuid);

    if (!fileExistsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }

    return file
      .arrayBuffer()
      .then((buffer) => new Uint8Array(buffer))
      .then((buffer) => writeFileSync(filePath.concat(this.#getFileExtension(file)), buffer, {}))
      .then(right)
      .catch((e) => left(error(uuid, e.message))) as Promise<
      Either<AntboxError, void>
    >;
  }

  list(): Promise<string[]> {
    const files = [...readdirSync(this.#path)];
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

    const folderPath = this.#buildFileFolderPath(uuid)

    const files = readdirSync(folderPath)

    join(this.#buildFileFolderPath(uuid), uuid)
  }

  #getFileExtension(file: File) {
    return (file.name.split(".")[file.name.split(".").length - 1])
  }
  
  #getExtensionFromPath(path: string) {
    return (path.split(".")[path.split(".").length - 1])
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
