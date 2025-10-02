import type { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import type { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { type Either } from "shared/either.ts";
import { type Event } from "shared/event.ts";
import { type EventHandler } from "shared/event_handler.ts";

export interface WriteFileOpts {
	title: string;
	parent: string;
	mimetype: string;
}

export interface StorageProvider {
	delete(uuid: string): Promise<Either<NodeNotFoundError, void>>;
	write(
		uuid: string,
		file: File,
		opts?: WriteFileOpts,
	): Promise<Either<DuplicatedNodeError, void>>;
	read(uuid: string): Promise<Either<NodeNotFoundError, File>>;
	startListeners(
		bus: (eventId: string, handler: EventHandler<Event>) => void,
	): void;
}
