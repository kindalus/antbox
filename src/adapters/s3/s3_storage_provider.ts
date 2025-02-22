import { S3Client } from "bun";

import { AntboxError } from "shared/antbox_error.ts";
import { UnknownError } from "shared/antbox_error.ts";
import { left, right, type Either } from "shared/either.ts";
import type {
  StorageProvider,
  WriteFileOpts,
} from "application/storage_provider.ts";
import type { EventHandler } from "shared/event_handler.ts";
import type { Event } from "shared/event.ts";

export default function buildS3StorageProvider(
  configPath: string,
): Promise<Either<AntboxError, S3StorageProvider>> {
  return import(configPath, { with: { type: "json" } })
    .then((config) => config.default)
    .then(
      (config) => new S3StorageProvider(new S3Client(config), config.bucket),
    )
    .then((provider) => right<AntboxError, S3StorageProvider>(provider))
    .catch((error) => left(new UnknownError(error.message)));
}
/**
 * S3StorageProvider is a StorageProvider implementation that uses S3 as the storage backend.
 * Reference API: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
 */

export class S3StorageProvider implements StorageProvider {
  readonly #s3: S3Client;
  readonly #bucket: string;

  constructor(s3: S3Client, bucket: string) {
    this.#s3 = s3;
    this.#bucket = bucket;
  }

  delete(uuid: string): Promise<Either<AntboxError, void>> {
    return this.#s3
      .delete(this.#getPath(uuid))
      .then(() => right<AntboxError, void>(undefined))
      .catch((err) => left<AntboxError, void>(new UnknownError(err.message)));
  }

  async write(
    uuid: string,
    file: File,
    opts?: WriteFileOpts | undefined,
  ): Promise<Either<AntboxError, void>> {
    const buffer = await file.arrayBuffer();
    const type = opts?.mimetype ?? file.type;

    return this.#s3
      .write(this.#getPath(uuid), file, { type })
      .then(() => right<AntboxError, void>(undefined))
      .catch((err) => left<AntboxError, void>(new UnknownError(err.message)));
  }

  read(uuid: string): Promise<Either<AntboxError, File>> {
    const file = this.#s3.file(this.#getPath(uuid));
    const name = file.name ?? "unknown";
    const type = file.type ?? "application/octet-stream";

    return file
      .arrayBuffer()
      .then((buf) => right<AntboxError, File>(new File([buf], name, { type })))
      .catch((err) => left(new UnknownError(err.message)));
  }

  #getPath(uuid: string): string {
    const prefix = this.#getPrefix(uuid);
    return `${prefix}/${uuid}`;
  }

  #getPrefix(uuid: string): string {
    const prefix = uuid.slice(0, 2).toUpperCase();
    return `nodes/${prefix[0]}/${prefix[1]}`;
  }

  startListeners(
    _bus: (eventId: string, handler: EventHandler<Event>) => void,
  ): void {}
}
