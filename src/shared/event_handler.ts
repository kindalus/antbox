import Event from "./event.ts";

export default interface EventHandler<T extends Event> {
	handle(event: T): void;
}
