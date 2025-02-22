import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { type EventHandler } from "shared/event_handler.ts";
import { type Event } from "shared/event.ts";

export interface WriteFileOpts {
  title: string;
  parent: string;
  mimetype: string;
}

export interface StorageProvider {
  delete(uuid: string): Promise<Either<AntboxError, void>>;
  write(
    uuid: string,
    file: File,
    opts?: WriteFileOpts,
  ): Promise<Either<AntboxError, void>>;
  read(uuid: string): Promise<Either<AntboxError, File>>;
  startListeners(
    bus: (eventId: string, handler: EventHandler<Event>) => void,
  ): void;
}
