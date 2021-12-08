import StorageProvider from "../../storage_provider";

import {
	deleteObject,
	FirebaseStorage,
	getDownloadURL,
	getStorage,
	ref,
	uploadBytes,
} from "firebase/storage";
import {} from "firebase/firestore";

export default class CmzStorageProvider implements StorageProvider {
	static FILE_CONTENT_NAME = "content";
	static NODES_PATH = "cmz/nodes";

	private storage: FirebaseStorage;

	constructor() {
		this.storage = getStorage();
	}

	delete(uuid: string): Promise<void> {
		return deleteObject(this.getObjectRef(uuid));
	}

	private getObjectRef(uuid: string) {
		return ref(this.storage, this.buildFilePath(uuid));
	}

	write(uuid: string, file: File): Promise<void> {
		return uploadBytes(this.getObjectRef(uuid), file).then(() => undefined);
	}

	read(uuid: string): Promise<File> {
		return this.getDownloadUrl(uuid)
			.then((url) => fetch(url))
			.then((res) => res.blob())
			.then((blob) => new File([blob], "Content"));
	}

	getDownloadUrl(uuid: string): Promise<string> {
		return getDownloadURL(this.getObjectRef(uuid));
	}

	private buildFilePath(uuid: string): string {
		return [this.buildFolderPath(uuid), CmzStorageProvider.FILE_CONTENT_NAME].join(
			"/",
		);
	}

	private buildFolderPath(uuid: string): string {
		return [CmzStorageProvider.NODES_PATH, uuid].join("/");
	}
}
