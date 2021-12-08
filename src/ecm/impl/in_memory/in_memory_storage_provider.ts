import StorageProvider from "../../storage_provider.ts";

export default class InMemoryStorageProvider implements StorageProvider {
	constructor(readonly fs: Record<string, File> = {}) {}
	read(uuid: string): Promise<File> {
		return Promise.resolve(this.fs[uuid]);
	}

	delete(uuid: string): Promise<void> {
		delete this.fs[uuid];
		return Promise.resolve();
	}

	write(uuid: string, file: File): Promise<void> {
		this.fs[uuid] = file;

		return Promise.resolve(undefined);
	}
}
