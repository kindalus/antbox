import type { Event } from "./event.ts";
export interface EventHandler<T extends Event> {
	handle(event: T): void | Promise<void>;
}

export function eventHandlerFunc<T extends Event>(
	handlerFunc: (event: T) => void | Promise<void>,
): EventHandler<T> {
	return { handle: handlerFunc };
}
