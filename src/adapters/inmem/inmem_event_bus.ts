import type { EventBus } from "shared/event_bus.ts";
import type { Event } from "shared/event.ts";
import type { EventHandler } from "shared/event_handler.ts";

export class InMemoryEventBus implements EventBus {
	#handlers: Record<string, EventHandler<Event>[]> = {};

	publish(event: Event): void {
		this.#handleAsync(event);
	}

	#handleAsync(event: Event): Promise<void> {
		return new Promise((resolve) => {
			const eventHandlers = this.#handlers[event.eventId];
			if (eventHandlers) {
				eventHandlers.forEach((handler) => {
					try {
						handler.handle(event);
					} catch (err) {
						console.error("Error in event handling:");
						console.error(err);
					}
				});
			}

			resolve();
		});
	}

	subscribe(eventId: string, handler: EventHandler<Event>): void {
		if (!handler.handle) {
			throw new Error(`Event handler not added for event [${eventId}]`);
		}

		if (!this.#handlers[eventId]) {
			this.#handlers[eventId] = [];
		}
		this.#handlers[eventId].push(handler);
	}

	unsubscribe(eventId: string, handler: EventHandler<Event>): void {
		const eventHandlers = this.#handlers[eventId];
		if (eventHandlers) {
			this.#handlers[eventId] = eventHandlers.filter((h) => h !== handler);
		}
	}
}
