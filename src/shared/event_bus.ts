import type { Event } from "./event.ts";
import type { EventHandler } from "./event_handler.ts";

export interface EventBus {
	publish(event: Event): void;
	subscribe(eventId: string, handler: EventHandler<Event>): void;
	unsubscribe(eventId: string, handler: EventHandler<Event>): void;
}
