import { createReadStream } from "node:fs";
import { drive_v3, google } from "npm:googleapis";

import { StorageProvider } from "../../domain/providers/storage_provider.ts";
import { Either, left, right } from "../../shared/either.ts";
import { AntboxError, UnknownError } from "../../shared/antbox_error.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";

export class GoogleDriveStorageProvider implements StorageProvider {
	readonly #drive: drive_v3.Drive;
	readonly #rootFolderId: string;

	constructor(drive: drive_v3.Drive, rootFolderId: string) {
		this.#drive = drive;
		this.#rootFolderId = rootFolderId;
	}

	async delete(uuid: string): Promise<Either<AntboxError, void>> {
		const idOrErr = await this.#getDriveMedata(uuid);

		if (idOrErr.isLeft()) {
			return left(idOrErr.value);
		}

		const { id: fileId } = idOrErr.value;

		return this.#drive.files.delete({ fileId })
			.then(right)
			.catch((e: Error) => left(new UnknownError(e.message))) as Promise<
				Either<AntboxError, void>
			>;
	}

	write(uuid: string, file: File): Promise<Either<AntboxError, void>> {
		const tmp = Deno.makeTempFileSync();
		Deno.writeFile(tmp, file.stream());

		const requestBody = {
			name: file.name,
			parents: [this.#rootFolderId],
			appProperties: { uuid },
		};

		const media = {
			mimeType: file.type,
			body: createReadStream(tmp),
		};

		return this.#drive.files.create({ media, requestBody })
			.then(right)
			.catch((e) => left(new UnknownError(e.message))) as Promise<Either<AntboxError, void>>;
	}

	async read(uuid: string): Promise<Either<AntboxError, File>> {
		const idOrErr = await this.#getDriveMedata(uuid);

		if (idOrErr.isLeft()) {
			throw idOrErr.value;
		}

		const { id: fileId, mimeType, name } = idOrErr.value;

		return this.#drive.files
			.get({ fileId, alt: "media" }, { responseType: "arraybuffer" })
			// deno-lint-ignore no-explicit-any
			.then((res: any) => right(new File([res.data], name, { type: mimeType })))
			.catch((e: Error) => left(new UnknownError(e.message))) as Promise<
				Either<AntboxError, File>
			>;
	}

	async #getDriveMedata(
		uuid: string,
	): Promise<Either<AntboxError, DriveMetada>> {
		const query = `appProperties has { key='uuid' and value='${uuid}' }`;

		const { data } = await this.#drive.files.list({
			q: query,
			fields: "files(id,mimeType,name)",
		});

		const files = data.files;

		if (!files || files.length === 0) {
			return left(new NodeNotFoundError(uuid));
		}

		const { id, mimeType, name } = files[0];

		return right({ id, mimeType, name } as DriveMetada);
	}
}

interface DriveMetada {
	id: string;
	mimeType: string;
	name: string;
}

function authenticate(keyFile: string): drive_v3.Drive {
	const auth = new google.auth.GoogleAuth({
		keyFile,
		scopes: [
			"https://www.googleapis.com/auth/drive",
			"https://www.googleapis.com/auth/drive.appdata",
			"https://www.googleapis.com/auth/drive.file",
			"https://www.googleapis.com/auth/drive.metadata",
		],
	});

	const drive = google.drive({
		version: "v3",
		auth,
	});

	return drive;
}

export default function buildGoogleDriveStorageProvider(
	keyPath: string,
	rootFolderId: string,
): Promise<Either<AntboxError, StorageProvider>> {
	console.log("Creating Google Drive Storage Provider");
	console.log("Key Path: ", keyPath);
	console.log("Root Folder Id: ", rootFolderId);

	const drive = authenticate(keyPath);
	const provider = new GoogleDriveStorageProvider(drive, rootFolderId);

	return Promise.resolve(right(provider));
}
