import { expect } from "expect";
import { stub } from "mock";
import buildFlatFileEventStoreRepository from "./flat_file_event_store_repository.ts";

const event = {
	eventType: "NodeUpdated",
	userEmail: "tester@antbox.io",
	occurredOn: "2026-01-01T00:00:00.000Z",
	payload: { value: "original" },
};

Deno.test("flat-file audit writes preserve memory and disk after write or rename failure", async () => {
	const directory = await Deno.makeTempDir();
	try {
		const repository = (await buildFlatFileEventStoreRepository(directory)).right;
		expect((await repository.append("audit_stream", "text/plain", event)).isRight()).toBe(true);
		const path = `${directory}/events/text_plain/audit_stream.json`;
		const before = await Deno.readTextFile(path);
		for (const operation of ["writeFileSync", "renameSync"] as const) {
			const write = stub(Deno, operation, () => {
				throw new Deno.errors.PermissionDenied("test persistence failure");
			});
			try {
				expect((await repository.append("audit_stream", "text/plain", {
					...event,
					payload: { value: "failed" },
				})).isLeft()).toBe(true);
			} finally {
				write.restore();
			}
			expect((await repository.getStream("audit_stream", "text/plain")).right).toHaveLength(1);
			expect(await Deno.readTextFile(path)).toBe(before);
		}
		expect((await repository.append("audit_stream", "text/plain", event)).isRight()).toBe(true);
		const restored = (await buildFlatFileEventStoreRepository(directory)).right;
		expect((await restored.getStream("audit_stream", "text/plain")).right.map((e) => e.sequence))
			.toEqual([0, 1]);
		expect(
			[...Deno.readDirSync(`${directory}/events/text_plain`)].map((entry) => entry.name).sort(),
		)
			.toEqual(["audit_stream.json", "audit_stream.json.backup"]);
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
});

Deno.test("flat-file audit initialization rejects corrupt streams without changing the file", async () => {
	const directory = await Deno.makeTempDir();
	try {
		await Deno.mkdir(`${directory}/events/text_plain`, { recursive: true });
		const path = `${directory}/events/text_plain/audit_stream.json`;
		for (const content of ["[incomplete", "null", "{}", "[{}]"]) {
			await Deno.writeTextFile(path, content);
			expect((await buildFlatFileEventStoreRepository(directory)).isLeft()).toBe(true);
			expect(await Deno.readTextFile(path)).toBe(content);
		}
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
});

Deno.test("flat-file audit initialization retains additional historical event fields", async () => {
	const directory = await Deno.makeTempDir();
	try {
		await Deno.mkdir(`${directory}/events/text_plain`, { recursive: true });
		const path = `${directory}/events/text_plain/audit_stream.json`;
		const historical = {
			...event,
			streamId: "audit_stream",
			sequence: 0,
			eventId: "legacy-event-id",
			tenant: "legacy-tenant",
		};
		await Deno.writeTextFile(path, JSON.stringify([historical]));
		const repository = (await buildFlatFileEventStoreRepository(directory)).right;
		expect((await repository.getStream("audit_stream", "text/plain")).right).toEqual([
			historical,
		]);
		expect((await repository.append("audit_stream", "text/plain", event)).isRight()).toBe(true);
		expect(JSON.parse(await Deno.readTextFile(path))[0]).toEqual(historical);
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
});

Deno.test("flat-file audit payloads remain immutable and noncloneable appends preserve disk", async () => {
	const directory = await Deno.makeTempDir();
	try {
		const repository = (await buildFlatFileEventStoreRepository(directory)).right;
		const appended = { ...event, payload: { nested: { values: ["original"] } } };
		const expected = { ...structuredClone(appended), streamId: "audit_stream", sequence: 0 };
		expect((await repository.append("audit_stream", "text/plain", appended)).isRight()).toBe(
			true,
		);
		const path = `${directory}/events/text_plain/audit_stream.json`;
		const before = await Deno.readTextFile(path);
		appended.payload.nested.values.push("after append");
		const read = (await repository.getStream("audit_stream", "text/plain")).right;
		expect(read).toEqual([expected]);
		(read[0].payload as typeof appended.payload).nested.values.push("after read");
		const all = (await repository.getStreamsByMimetype("text/plain")).right;
		expect(all.get("audit_stream")).toEqual([expected]);
		(all.get("audit_stream")![0].payload as typeof appended.payload).nested.values.push(
			"after list",
		);
		expect((await repository.getStream("audit_stream", "text/plain")).right).toEqual([expected]);
		expect((await repository.append("audit_stream", "text/plain", {
			...event,
			payload: { uncloneable: () => {} },
		})).isLeft()).toBe(true);
		expect(await Deno.readTextFile(path)).toBe(before);
		expect((await repository.getStream("audit_stream", "text/plain")).right).toEqual([expected]);
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
});
