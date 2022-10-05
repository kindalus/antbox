import { Event } from "./event.ts";

export interface EventHandler<T extends Event> {
  handle(event: T): void;
}
