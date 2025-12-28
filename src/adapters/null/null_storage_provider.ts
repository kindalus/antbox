import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { type Event } from "shared/event.ts";
import { type EventHandler } from "shared/event_handler.ts";
import { StorageProvider, WriteFileOpts } from "application/nodes/storage_provider.ts";

export class NullStorageProvider implements StorageProvider {
	delete(_uuid: string): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	write(
		_uuid: string,
		_file: File,
		_opts?: WriteFileOpts | undefined,
	): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	read(uuid: string): Promise<Either<AntboxError, File>> {
		return Promise.resolve(left(new NodeNotFoundError(uuid)));
	}

	startListeners(
		_bus: (eventId: string, handler: EventHandler<Event>) => void,
	): void {}
}

export default function buildNullStorageProvider(): Promise<
	Either<AntboxError, StorageProvider>
> {
	return Promise.resolve(right(new NullStorageProvider()));
}
