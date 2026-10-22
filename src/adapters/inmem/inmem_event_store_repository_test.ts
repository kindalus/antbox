import { expect } from "expect";
import { InMemoryEventStoreRepository } from "./inmem_event_store_repository.ts";

Deno.test("in-memory audit history is isolated from appended and returned payloads", async () => {
	const repository = new InMemoryEventStoreRepository();
	const event = {
		eventType: "NodeUpdated",
		occurredOn: "2026-01-01T00:00:00.000Z",
		userEmail: "tester@antbox.io",
		payload: { nested: { values: ["original"] } },
	};
	const expected = { ...structuredClone(event), streamId: "stream", sequence: 0 };
	expect((await repository.append("stream", "text/plain", event)).isRight()).toBe(true);
	event.payload.nested.values.push("after append");
	const read = (await repository.getStream("stream", "text/plain")).right;
	expect(read).toEqual([expected]);
	(read[0].payload as typeof event.payload).nested.values.push("after read");
	read[0].eventType = "changed";
	const all = (await repository.getStreamsByMimetype("text/plain")).right;
	expect(all.get("stream")).toEqual([expected]);
	(all.get("stream")![0].payload as typeof event.payload).nested.values.push("after list");
	expect((await repository.getStream("stream", "text/plain")).right).toEqual([expected]);

	const failed = await repository.append("stream", "text/plain", {
		...event,
		payload: { uncloneable: () => {} },
	});
	expect(failed.isLeft()).toBe(true);
	expect((await repository.getStream("stream", "text/plain")).right).toEqual([expected]);
});
