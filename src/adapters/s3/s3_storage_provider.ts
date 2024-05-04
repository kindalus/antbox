import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3,
} from "npm:@aws-sdk/client-s3";

import { StorageProvider, WriteFileOpts } from "../../domain/providers/storage_provider.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either, left, right } from "../../shared/either.ts";
import { Event } from "../../shared/event.ts";
import { EventHandler } from "../../shared/event_handler.ts";
import { UnknownError } from "../../shared/antbox_error.ts";

/**
 * S3StorageProvider is a StorageProvider implementation that uses S3 as the storage backend.
 * Reference API: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
 */

export class S3StorageProvider implements StorageProvider {
	constructor(private readonly s3: S3, private readonly bucket: string) {}

	delete(uuid: string): Promise<Either<AntboxError, void>> {
		const cmd = new DeleteObjectCommand({
			Bucket: this.bucket,
			Key: this.#getKey(uuid),
		});

		return this.s3.send(cmd)
			.then(() => right<AntboxError, void>(undefined))
			.catch((error) => {
				console.error(error);
				return left<AntboxError, void>(new UnknownError(error.message));
			});
	}

	async write(
		uuid: string,
		file: File,
		opts?: WriteFileOpts | undefined,
	): Promise<Either<AntboxError, void>> {
		const buffer = await file.arrayBuffer();

		const cmd = new PutObjectCommand({
			Bucket: this.bucket,
			Key: this.#getKey(uuid),
			Body: new Uint8Array(buffer),
			ContentType: file.type,
			Metadata: { parent: opts?.parent!, title: opts?.title! },
		});

		return this.s3.send(cmd)
			.then(() => right<AntboxError, void>(undefined))
			.catch((error) => {
				console.error(error);
				return left(new UnknownError(error.message));
			});
	}

	read(uuid: string): Promise<Either<AntboxError, File>> {
		const cmd = new GetObjectCommand({
			Bucket: this.bucket,
			Key: this.#getKey(uuid),
		});

		return this.s3.send(cmd).then(async ({ Body, ContentType, Metadata }) => {
			const type = ContentType ?? "application/octet-stream";
			const title = Metadata?.title ?? "unknown";

			const array = await Body?.transformToByteArray()!;
			const file = new File([array], title, { type });

			return right<AntboxError, File>(file);
		}).catch((error) => {
			console.error("Error???", error);
			return left(new UnknownError(error.message));
		});
	}

	#getKey(uuid: string): string {
		const prefix = this.#getPrefix(uuid);
		return `${prefix}/${uuid}`;
	}

	#getPrefix(uuid: string): string {
		const prefix = uuid.slice(0, 2).toUpperCase();
		return `nodes/${prefix[0]}/${prefix[1]}`;
	}

	startListeners(_bus: (eventId: string, handler: EventHandler<Event>) => void): void {}
}
