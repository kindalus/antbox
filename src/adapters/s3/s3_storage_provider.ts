import type { StorageProvider, WriteFileOpts } from "application/nodes/storage_provider.ts";
import { S3Client } from "s3";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import * as path from "path";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { Event } from "shared/event.ts";
import type { EventHandler } from "shared/event_handler.ts";

/**
 * Builds an S3-backed StorageProvider from a JSON config file.
 *
 * @remarks
 * External setup:
 * - Create an S3-compatible bucket and access keys with read/write permissions.
 * - Provide a JSON config file with region, endpoint, bucket, and credentials.
 * - Ensure Deno has `--allow-read` for the config file and `--allow-net` for S3 access.
 *
 * @example
 * const storageOrErr = await buildS3StorageProvider("./s3.config.json");
 * if (storageOrErr.isRight()) {
 *   const storage = storageOrErr.value;
 * }
 */
export default function buildS3StorageProvider(
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

	async delete(uuid: string): Promise<Either<AntboxError, void>> {
		try {
			await this.#s3.realS3Client().send(
				new DeleteObjectCommand({
					Bucket: this.#bucket,
					Key: this.#getPath(uuid),
				}),
			);
			return right(undefined);
		} catch (error) {
			return left(storageError(uuid, error));
		}
	}

	mkdir(_uuid: string): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	rmdir(_uuid: string): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	async write(
		uuid: string,
		file: File,
		opts?: WriteFileOpts | undefined,
	): Promise<Either<AntboxError, void>> {
		try {
			await this.#s3.realS3Client().send(
				new PutObjectCommand({
					Bucket: this.#bucket,
					Key: this.#getPath(uuid),
					Body: new Uint8Array(await file.arrayBuffer()),
					ContentType: opts?.mimetype ?? file.type,
				}),
			);
			return right(undefined);
		} catch (error) {
			return left(new UnknownError(error instanceof Error ? error.message : String(error)));
		}
	}

	async read(uuid: string): Promise<Either<AntboxError, File>> {
		try {
			const name = this.#getPath(uuid);
			const response = await this.#s3.realS3Client().send(
				new GetObjectCommand({
					Bucket: this.#bucket,
					Key: name,
				}),
			);
			if (!response.Body) return left(new UnknownError("S3 response has no object body"));
			const bytes = new Uint8Array(await response.Body.transformToByteArray());
			return right(
				new File([bytes], name, {
					type: response.ContentType || "application/octet-stream",
				}),
			);
		} catch (error) {
			return left(storageError(uuid, error));
		}
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

	provideCDN(): boolean {
		return false;
	}

	getCDNUrl(_uuid: string): string | undefined {
		return undefined;
	}
}

function storageError(uuid: string, error: unknown): AntboxError {
	const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
	if (
		failure?.$metadata?.httpStatusCode === 404 &&
		(failure.name === "NoSuchKey" || failure.name === "NotFound")
	) return new NodeNotFoundError(uuid);
	return new UnknownError(error instanceof Error ? error.message : String(error));
}
