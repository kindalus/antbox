import { auth, drive, drive_v3 } from "@googleapis/drive";
import { Logger } from "shared/logger.ts";
import type { StorageProvider, WriteFileOpts } from "application/nodes/storage_provider.ts";
import type { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { NodeFileNotFoundError } from "domain/nodes/node_file_not_found_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { createReadStream } from "node:fs";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type Event } from "shared/event.ts";
import { type EventHandler } from "shared/event_handler.ts";
import { makeTempFileSync, writeFile } from "shared/os_helpers.ts";

/**
 * Builds a Google Drive-backed StorageProvider using a service account key.
 *
 * @remarks
 * External setup:
 * - Enable the Google Drive API in your Google Cloud project.
 * - Create a service account, download the JSON key, and grant it access to the root folder.
 * - Provide the Drive folder ID and ensure Deno has `--allow-read`/`--allow-net`.
 *
 * @example
 * const storageOrErr = await buildGoogleDriveStorageProvider(
 *   "/path/to/service-account.json",
 *   "drive-folder-id",
 * );
 * if (storageOrErr.isRight()) {
 *   const storage = storageOrErr.value;
 * }
 */
export default async function buildGoogleDriveStorageProvider(
	keyPath: string,
	rootFolderId: string,
): Promise<Either<AntboxError, StorageProvider>> {
	const drive = authenticate(keyPath);

	const { status } = await drive.files.get({ fileId: rootFolderId });

	if (status !== 200) {
		return left(new NodeNotFoundError(rootFolderId));
	}

	const provider = new GoogleDriveStorageProvider(drive, rootFolderId);

	return Promise.resolve(right(provider));
}

function authenticate(keyFile: string): drive_v3.Drive {
	/**
	 * Service account credentials
	 * Service accounts allow you to perform server to server, app-level authentication
	 * using a robot account. You will create a service account, download a keyfile,
	 * and use that to authenticate to Google APIs. To create a service account:
	 * https://console.cloud.google.com/apis/credentials/serviceaccountkey
	 */
	const client = new auth.GoogleAuth({
		keyFile,
		scopes: [
			"https://www.googleapis.com/auth/drive",
			"https://www.googleapis.com/auth/drive.appdata",
			"https://www.googleapis.com/auth/drive.file",
			"https://www.googleapis.com/auth/drive.metadata",
		],
	});

	return drive({
		version: "v3",
		auth: client,
	});
}

class GoogleDriveStorageProvider implements StorageProvider {
	readonly #drive: drive_v3.Drive;
	readonly #rootFolderId: string;

	constructor(drive: drive_v3.Drive, rootFolderId: string) {
		this.#drive = drive;
		this.#rootFolderId = rootFolderId;
	}

	async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const metadataOrError = await this.#getDriveMedata(uuid);

		if (metadataOrError.isLeft()) {
			return left(metadataOrError.value);
		}

		const { id: fileId } = metadataOrError.value;

		return this.#drive.files
			.delete({ fileId })
			.then(() => right(undefined))
			.catch((e: Error) => {
				Logger.error(e.message);
				return left(new NodeFileNotFoundError(uuid));
			}) as Promise<Either<NodeNotFoundError, void>>;
	}

	async write(
		uuid: string,
		file: File,
		opts: WriteFileOpts,
	): Promise<Either<DuplicatedNodeError, void>> {
		const tmp = makeTempFileSync();
		await writeFile(tmp, file);

		const metadataOrError = await this.#getDriveMedata(uuid);

		const requestBody = {
			name: opts.title,
			parents: [this.#rootFolderId],
			appProperties: { uuid },
			mimeType: file.type,
		};

		const media = {
			mimeType: file.type,
			body: createReadStream(tmp),
		};

		const res = metadataOrError.isRight()
			? await this.#drive.files.update({
				fileId: metadataOrError.value.id,
				media,
			})
			: await this.#drive.files.create({ media, requestBody });

		if (res.status !== 200) {
			return left(new UnknownError(res.statusText));
		}

		const id = res.data.id!;

		if (metadataOrError.isLeft() && opts.parent !== Nodes.ROOT_FOLDER_UUID) {
			await this.#updateParentFolderId(id, opts.parent);
		}

		return right(undefined);
	}

	async #updateParentFolderId(fileId: string, parent: string) {
		const parentMetadataOrError = await this.#getDriveMedata(parent);

		if (parentMetadataOrError.isLeft()) {
			Logger.error(parentMetadataOrError.value.message);
			return;
		}

		this.#drive.files
			.update({
				fileId,
				removeParents: this.#rootFolderId,
				addParents: parentMetadataOrError.value.id,
			})
			.catch((e: unknown) => Logger.error((e as Error).message));
	}

	async #handleNodeUpdated(evt: NodeUpdatedEvent) {
		if (!evt.payload.newValues.parent && !evt.payload.newValues.title) {
			return;
		}

		const fileOrErr = await this.#getDriveMedata(evt.payload.uuid);
		if (fileOrErr.isLeft()) {
			Logger.error(fileOrErr.value.message);
			return;
		}

		const requestBody: Record<string, string | string[]> = {};

		if (evt.payload.newValues.parent) {
			const newParentOrErr = await this.#getDriveMedata(evt.payload.newValues.parent);
			if (newParentOrErr.isLeft()) {
				Logger.error(newParentOrErr.value.message);
				return;
			}

			requestBody["removeParents"] = fileOrErr.value.parents;
			requestBody["addParents"] = newParentOrErr.value.id;
		}

		if (evt.payload.newValues.title) {
			requestBody["name"] = evt.payload.newValues.title;
		}

		this.#drive.files
			.update({ fileId: fileOrErr.value.id, requestBody })
			.catch((e: unknown) => Logger.error((e as Error).message));
	}

	async #handleNodeDeleted(evt: NodeDeletedEvent) {
		if (!Nodes.isFolder(evt.payload)) {
			return;
		}

		const idOrErr = await this.#getDriveMedata(evt.payload.uuid);
		if (idOrErr.isLeft()) {
			Logger.error(idOrErr.value);
			return;
		}

		this.#drive.files
			.delete({ fileId: idOrErr.value.id })
			.catch((e: unknown) => Logger.error((e as Error).message));
	}

	async #handleNodeCreated(evt: NodeCreatedEvent) {
		if (!Nodes.isFolder(evt.payload)) {
			return;
		}

		const node = evt.payload;

		let parentId = this.#rootFolderId;

		if (evt.payload.parent !== Nodes.ROOT_FOLDER_UUID) {
			const parentOrErr = await this.#getDriveMedata(evt.payload.parent);
			if (parentOrErr.isLeft()) {
				Logger.error(parentOrErr.value.message);
				return;
			}
			parentId = parentOrErr.value.id;
		}

		return this.#createGoogleDriveFolder(node.uuid, node.title, parentId);
	}

	#createGoogleDriveFolder(
		uuid: string,
		title: string,
		parentId: string,
	) {
		const requestBody = {
			name: title,
			parents: [parentId],
			appProperties: { uuid },
			mimeType: "application/vnd.google-apps.folder",
		};

		return this.#drive.files
			.create({ requestBody })
			.catch((e: unknown) => Logger.error((e as Error).message));
	}

	async read(uuid: string): Promise<Either<NodeNotFoundError, File>> {
		const idOrErr = await this.#getDriveMedata(uuid);

		if (idOrErr.isLeft()) {
			return left(idOrErr.value);
		}

		const { id: fileId, mimeType, name } = idOrErr.value;

		return this.#drive.files
			.get({ fileId, alt: "media" })
			.then((res) => {
				if (res.status !== 200) {
					return left(new NodeFileNotFoundError(uuid));
				}

				// deno-lint-ignore no-explicit-any
				return right(new File([(res as any).data], name, { type: mimeType }));
			})
			.catch((e: unknown) => {
				Logger.error((e as Error).message);
				return left(new NodeFileNotFoundError(uuid));
			}) as Promise<Either<NodeNotFoundError, File>>;
	}

	startListeners(
		subscribe: (eventId: string, handler: EventHandler<Event>) => void,
	): void {
		subscribe(NodeDeletedEvent.EVENT_ID, {
			handle: (evt: NodeDeletedEvent) => this.#handleNodeDeleted(evt),
		});
		subscribe(NodeUpdatedEvent.EVENT_ID, {
			handle: (evt: NodeUpdatedEvent) => this.#handleNodeUpdated(evt),
		});

		subscribe(NodeCreatedEvent.EVENT_ID, {
			handle: (evt: NodeCreatedEvent) => this.#handleNodeCreated(evt),
		});
	}

	async #getDriveMedata(
		uuid: string,
	): Promise<Either<AntboxError, DriveMetada>> {
		const q = `appProperties has { key='uuid' and value='${uuid}' }`;

		const { data } = await this.#drive.files.list({
			q,
			fields: "files(id,mimeType,name,parents,trashed)",
		});

		const files = data.files;

		if (!files || files.length === 0) {
			return left(new NodeNotFoundError(uuid));
		}

		const { id, mimeType, name, parents, trashed } = files[0];

		return right({ id, mimeType, name, parents, trashed } as DriveMetada);
	}

	provideCDN(): boolean {
		return false;
	}

	getCDNUrl(_uuid: string): string | undefined {
		return undefined;
	}
}

interface DriveMetada {
	id: string;
	mimeType: string;
	name: string;
	parents: string[];
}
