import type { Event } from "./event.ts";
export interface EventHandler<T extends Event> {
	handle(event: T): void;
}

export function eventHandlerFunc<T extends Event>(
	handlerFunc: (event: T) => void,
): EventHandler<T> {
	return {
		handle(event: T): void {
			handlerFunc(event);
		},
	};
}
