import type { Event } from "./event";
import type { EventHandler } from "./event_handler";

export interface EventBus {
  publish(event: Event): Promise<void>;
  subscribe(eventId: string, handler: EventHandler<Event>): void;
  unsubscribe(eventId: string, handler: EventHandler<Event>): void;
}
