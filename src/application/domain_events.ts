import { type EventHandler } from "shared/event_handler.ts";
import { type Event } from "shared/event.ts";

export class DomainEvents {
  private static _handlers: Record<string, EventHandler<Event>[]> = {};

  static notify(event: Event): Promise<void> {
    return new Promise((resolve, _reject) => {
      const handlers = DomainEvents._handlers[event.eventId];

      if (handlers) {
        handlers.forEach((handler) => handler.handle(event));
      }
      resolve();
    });
  }

  static subscribe(eventId: string, handler: EventHandler<Event>) {
    if (!DomainEvents._handlers[eventId]) {
      DomainEvents._handlers[eventId] = [];
    }

    DomainEvents._handlers[eventId].push(handler);
  }

  static clearHandlers() {
    DomainEvents._handlers = {};
  }

  static unsubscribe<T extends Event>(
    eventId: string,
    handler: EventHandler<T>,
  ) {
    const handlers = DomainEvents._handlers[eventId];

    if (handlers) {
      DomainEvents._handlers[eventId] = handlers.filter((h) => h !== handler);
    }
  }

  static get handlers() {
    return DomainEvents._handlers;
  }
}
