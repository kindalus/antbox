import { auth, drive, drive_v3 } from "@googleapis/drive";
import { Logger } from "shared/logger.ts";
import type { StorageProvider, WriteFileOpts } from "application/nodes/storage_provider.ts";
import { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { NodeFileNotFoundError } from "domain/nodes/node_file_not_found_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type Event } from "shared/event.ts";
import { type EventHandler } from "shared/event_handler.ts";

/**
 * Builds a Google Drive-backed StorageProvider using a service account key.
 *
 * @remarks
 * External setup:
 * - Enable the Google Drive API in your Google Cloud project.
 * - Create a service account, download the JSON key, and add it to a Shared Drive.
 * - Provide the Shared Drive ID and ensure Deno has `--allow-read`/`--allow-net`.
 *
 * @example
 * const storageOrErr = await buildGoogleDriveStorageProvider(
 *   "/path/to/service-account.json",
 *   "shared-drive-id",
 * );
 * if (storageOrErr.isRight()) {
 *   const storage = storageOrErr.value;
 * }
 */
export default async function buildGoogleDriveStorageProvider(
	keyPath: string,
	sharedDriveId: string,
): Promise<Either<AntboxError, StorageProvider>> {
	const drive = authenticate(keyPath);

	try {
		const { status } = await drive.drives.get({
			driveId: sharedDriveId,
			useDomainAdminAccess: false,
		});

		if (status !== 200) {
			return left(new NodeNotFoundError(sharedDriveId));
		}
	} catch (error) {
		return left(
			new UnknownError(
				`Could not access shared drive '${sharedDriveId}'. Ensure the Google Drive API is enabled and the service account is a member of the Shared Drive: ${
					(error as Error).message
				}`,
			),
		);
	}

	const provider = new GoogleDriveStorageProvider(drive, sharedDriveId);

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

export class GoogleDriveStorageProvider implements StorageProvider {
	readonly #drive: drive_v3.Drive;
	readonly #sharedDriveId: string;

	constructor(drive: drive_v3.Drive, sharedDriveId: string) {
		this.#drive = drive;
		this.#sharedDriveId = sharedDriveId;
	}

	async delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const metadataOrError = await this.#getDriveMedata(uuid);

		if (metadataOrError.isLeft()) {
			return left(metadataOrError.value);
		}

		const { id: fileId } = metadataOrError.value;

		return this.#trashFile(fileId, uuid) as Promise<Either<NodeNotFoundError, void>>;
	}

	async write(
		uuid: string,
		file: File,
		opts: WriteFileOpts,
	): Promise<Either<DuplicatedNodeError, void>> {
		try {
			const metadataOrError = await this.#getDriveMedata(uuid);
			if (metadataOrError.isLeft() && metadataOrError.value instanceof DuplicatedNodeError) {
				return left(metadataOrError.value);
			}

			const requestBody = {
				name: opts.title,
				parents: [this.#sharedDriveId],
				appProperties: { uuid },
				mimeType: file.type,
			};

			const media = {
				mimeType: file.type,
				body: Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>),
			};

			const res = metadataOrError.isRight()
				? await this.#drive.files.update({
					fileId: metadataOrError.value.id,
					media,
					supportsAllDrives: true,
				})
				: await this.#drive.files.create({
					media,
					requestBody,
					supportsAllDrives: true,
				});

			if (res.status !== 200 && res.status !== 201) {
				return left(new UnknownError(res.statusText));
			}

			const id = res.data.id!;

			if (metadataOrError.isLeft() && opts.parent !== Nodes.ROOT_FOLDER_UUID) {
				await this.#updateParentFolderId(id, opts.parent);
			}
		} catch (error) {
			return left(new UnknownError((error as Error).message));
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
				removeParents: this.#sharedDriveId,
				addParents: parentMetadataOrError.value.id,
				supportsAllDrives: true,
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
			.update({ fileId: fileOrErr.value.id, requestBody, supportsAllDrives: true })
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
			.update({
				fileId: idOrErr.value.id,
				requestBody: { trashed: true },
				supportsAllDrives: true,
			})
			.catch((e: unknown) => Logger.error((e as Error).message));
	}

	async #handleNodeCreated(evt: NodeCreatedEvent) {
		if (!Nodes.isFolder(evt.payload)) {
			return;
		}

		const node = evt.payload;

		let parentId = this.#sharedDriveId;

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
			.create({ requestBody, supportsAllDrives: true })
			.catch((e: unknown) => Logger.error((e as Error).message));
	}

	async read(uuid: string): Promise<Either<NodeNotFoundError, File>> {
		const idOrErr = await this.#getDriveMedata(uuid);

		if (idOrErr.isLeft()) {
			return left(idOrErr.value);
		}

		const { id: fileId, mimeType, name } = idOrErr.value;
		const nativeExportMimeType = this.#getNativeExportMimeType(mimeType);

		try {
			const response = nativeExportMimeType
				? await this.#drive.files.export(
					{
						fileId,
						mimeType: nativeExportMimeType,
					},
					{ responseType: "arraybuffer" },
				)
				: await this.#drive.files.get(
					{ fileId, alt: "media", supportsAllDrives: true },
					{ responseType: "arraybuffer" },
				);

			if (response.status !== 200) {
				return left(new NodeFileNotFoundError(uuid));
			}

			const fileData = this.#responseDataToArrayBuffer(response.data);
			return right(
				new File([fileData], this.#exportedFileName(name, nativeExportMimeType), {
					type: nativeExportMimeType ?? mimeType,
				}),
			);
		} catch (error) {
			const apiError = error as { code?: number; message: string };
			Logger.error(apiError.message);

			if (apiError.code === 404) {
				return left(new NodeFileNotFoundError(uuid));
			}

			return left(
				new UnknownError(`Google Drive export failed for '${uuid}': ${apiError.message}`),
			);
		}
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
		const q = `trashed=false and appProperties has { key='uuid' and value='${uuid}' }`;

		const { data } = await this.#drive.files.list({
			q,
			corpora: "drive",
			driveId: this.#sharedDriveId,
			includeItemsFromAllDrives: true,
			supportsAllDrives: true,
			fields: "files(id,mimeType,name,parents,trashed)",
		});

		const files = (data.files ?? []).filter((file) => !file.trashed);

		if (files.length === 0) {
			return left(new NodeNotFoundError(uuid));
		}

		if (files.length > 1) {
			return left(new DuplicatedNodeError(uuid));
		}

		const { id, mimeType, name, parents, trashed } = files[0];

		return right({ id, mimeType, name, parents, trashed } as DriveMetada);
	}

	async #trashFile(fileId: string, uuid: string): Promise<Either<AntboxError, void>> {
		try {
			const response = await this.#drive.files.update({
				fileId,
				requestBody: { trashed: true },
				supportsAllDrives: true,
			});

			if (response.status !== 200) {
				return left(
					new UnknownError(`Google Drive trash failed for '${uuid}': ${response.statusText}`),
				);
			}

			return right(undefined);
		} catch (error) {
			const apiError = error as { code?: number; message: string };
			Logger.error(apiError.message);

			if (apiError.code === 404) {
				return left(new NodeFileNotFoundError(uuid));
			}

			return left(
				new UnknownError(`Google Drive trash failed for '${uuid}': ${apiError.message}`),
			);
		}
	}

	#responseDataToArrayBuffer(data: unknown): ArrayBuffer {
		if (data instanceof ArrayBuffer) {
			return data;
		}

		if (ArrayBuffer.isView(data)) {
			const view = data as ArrayBufferView;
			const bytes = new Uint8Array(view.byteLength);
			bytes.set(new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength));
			return bytes.buffer;
		}

		if (typeof data === "string") {
			return new TextEncoder().encode(data).buffer;
		}

		throw new UnknownError("Unexpected Google Drive download payload type");
	}

	#getNativeExportMimeType(mimeType: string): string | undefined {
		switch (mimeType) {
			case "application/vnd.google-apps.document":
				return "application/pdf";
			case "application/vnd.google-apps.spreadsheet":
				return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
			case "application/vnd.google-apps.presentation":
				return "application/pdf";
			default:
				return undefined;
		}
	}

	#exportedFileName(name: string, mimeType?: string): string {
		if (!mimeType) {
			return name;
		}

		const suffix = this.#exportFileSuffix(mimeType);
		return suffix && !name.endsWith(suffix) ? `${name}${suffix}` : name;
	}

	#exportFileSuffix(mimeType: string): string | undefined {
		switch (mimeType) {
			case "application/pdf":
				return ".pdf";
			case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
				return ".xlsx";
			default:
				return undefined;
		}
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
