import type { EventBus } from "shared/event_bus.ts";
import type { Event } from "shared/event.ts";
import type { EventHandler } from "shared/event_handler.ts";
import { Logger } from "shared/logger.ts";

/**
 * In-memory EventBus for development and tests.
 *
 * @remarks
 * External setup: none.
 *
 * @example
 * const bus = new InMemoryEventBus();
 */
export class InMemoryEventBus implements EventBus {
	#handlers: Record<string, EventHandler<Event>[]> = Object.create(null);

	publish(event: Event): void {
		queueMicrotask(() => void this.#handleAsync(event));
	}

	async #handleAsync(event: Event): Promise<void> {
		await Promise.all((this.#handlers[event.eventId] ?? []).map(async (handler) => {
			try {
				await handler.handle(event);
			} catch (err) {
				Logger.error("Error in event handling:", err);
			}
		}));
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
