import { NodeFileNotFoundError } from "domain/nodes/node_file_not_found_error.ts";
import { type StorageProvider } from "application/nodes/storage_provider.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export default function buildInmemStorageProvider(): Promise<
	Either<AntboxError, StorageProvider>
> {
	return Promise.resolve(right(new InMemoryStorageProvider()));
}

export class InMemoryStorageProvider implements StorageProvider {
	constructor(readonly fs: Record<string, File> = {}) {}

	read(uuid: string): Promise<Either<AntboxError, File>> {
		const file = this.fs[uuid];

		if (!file) {
			const error = new NodeFileNotFoundError(uuid);
			return Promise.resolve(left(error));
		}

		return Promise.resolve(right(file));
	}

	delete(uuid: string): Promise<Either<AntboxError, void>> {
		const file = this.fs[uuid];

		if (!file) {
			const error = new NodeFileNotFoundError(uuid);
			return Promise.resolve(left(error));
		}

		delete this.fs[uuid];
		return Promise.resolve(right(undefined));
	}

	write(uuid: string, file: File): Promise<Either<AntboxError, void>> {
		this.fs[uuid] = file;

		return Promise.resolve(right(undefined));
	}

	startListeners(): void {
		// Do nothing
	}

	provideCDN(): boolean {
		return false;
	}

	getCDNUrl(_uuid: string): string | undefined {
		return undefined;
	}
}
