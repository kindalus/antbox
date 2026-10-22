import { describe, it } from "bdd";
import { expect } from "expect";
import { stub } from "mock";
import type { Event } from "shared/event.ts";
import { eventHandlerFunc } from "shared/event_handler.ts";
import { Logger } from "shared/logger.ts";
import { InMemoryEventBus } from "./inmem_event_bus.ts";

const event: Event = {
	eventId: "test-event",
	occurredOn: new Date(),
	payload: {},
	userEmail: "test@example.com",
	tenant: "test",
};

describe("InMemoryEventBus", () => {
	it("contains sync and async handler failures while delivering to other subscribers", async () => {
		using errors = stub(Logger, "error");
		const bus = new InMemoryEventBus();
		let delivered = 0;
		const failures = [new Error("sync failure"), new Error("async failure")];
		bus.subscribe(
			event.eventId,
			eventHandlerFunc(() => {
				throw failures[0];
			}),
		);
		bus.subscribe(
			event.eventId,
			eventHandlerFunc(async () => {
				await Promise.resolve();
				throw failures[1];
			}),
		);
		bus.subscribe(event.eventId, {
			handle: () => {
				delivered++;
			},
		});

		bus.publish(event);
		expect(delivered).toBe(0);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(delivered).toBe(1);
		for (const failure of failures) {
			expect(errors.calls.some((call) => call.args.includes(failure))).toBe(true);
		}
	});

	it("supports arbitrary event names and unsubscribes only the selected handler", async () => {
		const bus = new InMemoryEventBus();
		const received: string[] = [];
		const removed = {
			handle: () => {
				received.push("removed");
			},
		};
		bus.subscribe("constructor", removed);
		bus.subscribe("constructor", {
			handle: () => {
				received.push("retained");
			},
		});
		bus.unsubscribe("constructor", removed);
		bus.publish({ ...event, eventId: "constructor" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(received).toEqual(["retained"]);
	});
});
