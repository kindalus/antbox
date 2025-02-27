import type { StorageProvider, WriteFileOpts } from "application/storage_provider.ts";
import { S3Client } from "bun";
import type { DuplicatedNodeError } from "domain/nodes/duplicated_node_error";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import path from "path";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { left, right, type Either } from "shared/either.ts";
import type { Event } from "shared/event.ts";
import type { EventHandler } from "shared/event_handler.ts";

export default async function buildS3StorageProvider(
  configPath: string,
): Promise<Either<AntboxError, S3StorageProvider>> {
  const config_path = path.resolve(configPath);
  return import(config_path, { with: { type: "json" } })
    .then((config) => config.default)
    .then((config) => {
      return new S3StorageProvider(
        new S3Client({
          region: config.region,
          endpoint: config.endpoint,
          bucket: config.bucket,
          accessKeyId: config.credentials.accessKeyId,
          secretAccessKey: config.credentials.secretAccessKey,
        }),
        config.bucket,
      );
    })
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

  async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
    const fileOrErr = await this.read(uuid);
    if (fileOrErr.isLeft()) {
      return left(new NodeNotFoundError(uuid));
    }

    return this.#s3
      .delete(this.#getPath(uuid))
      .then(() => right(undefined))
      .catch((err) => {
        return left(new NodeNotFoundError(uuid));
      }) as Promise<Either<NodeNotFoundError, void>>;
  }

  async write(
    uuid: string,
    file: File,
    opts?: WriteFileOpts | undefined,
  ): Promise<Either<DuplicatedNodeError, void>> {
    const buffer = await file.arrayBuffer();
    const type = opts?.mimetype ?? file.type;

    return this.#s3
      .write(this.#getPath(uuid), buffer, { type })
      .then(() => right(undefined))
      .catch((err) => {
        return left(new UnknownError(err.message));
      }) as Promise<Either<DuplicatedNodeError, void>>;
  }

  async read(uuid: string): Promise<Either<NodeNotFoundError, File>> {
    const s3FileRef = this.#s3.file(this.#getPath(uuid));
    const name = s3FileRef.name ?? "unknown";
    const type = s3FileRef.type || "application/octet-stream";

    return s3FileRef
      .arrayBuffer()
      .then((buf) => right(new File([buf], name, { type })))
      .catch((err) => {
        return left(new NodeNotFoundError(uuid));
      }) as Promise<Either<NodeNotFoundError, File>>;
  }

  #getPath(uuid: string): string {
    const prefix = this.#getPrefix(uuid);
    return `${prefix}/${uuid}`;
  }

  #getPrefix(uuid: string): string {
    const prefix = uuid.slice(0, 2).toUpperCase();
    return `nodes/${prefix[0]}/${prefix[1]}`;
  }

  startListeners(_bus: (eventId: string, handler: EventHandler<Event>) => void): void {}
}
