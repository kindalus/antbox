import { it } from "bdd";
import { expect } from "expect";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stub } from "shared/testing/stub.ts";
import buildFlatFileEventStoreRepository from "./flat_file_event_store_repository.ts";

const event = {
	eventType: "NodeUpdated",
	userEmail: "tester@antbox.io",
	occurredOn: "2026-01-01T00:00:00.000Z",
	payload: { value: "original" },
};

it("flat-file audit writes preserve memory and disk after write or rename failure", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		const repository = (await buildFlatFileEventStoreRepository(directory)).right;
		expect((await repository.append("audit_stream", "text/plain", event)).isRight()).toBe(true);
		const path = `${directory}/events/text_plain/audit_stream.json`;
		const before = await fs.readFile(path, "utf-8");
		for (const operation of ["writeFileSync", "renameSync"] as const) {
			const write = stub(fsSync, operation, () => {
				throw Object.assign(new Error("test persistence failure"), { code: "EACCES" });
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
			expect(await fs.readFile(path, "utf-8")).toBe(before);
		}
		expect((await repository.append("audit_stream", "text/plain", event)).isRight()).toBe(true);
		const restored = (await buildFlatFileEventStoreRepository(directory)).right;
		expect((await restored.getStream("audit_stream", "text/plain")).right.map((e) => e.sequence))
			.toEqual([0, 1]);
		expect(
			fsSync.readdirSync(`${directory}/events/text_plain`).sort(),
		)
			.toEqual(["audit_stream.json", "audit_stream.json.backup"]);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

it("flat-file audit initialization rejects corrupt streams without changing the file", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		await fs.mkdir(`${directory}/events/text_plain`, { recursive: true });
		const path = `${directory}/events/text_plain/audit_stream.json`;
		for (const content of ["[incomplete", "null", "{}", "[{}]"]) {
			await fs.writeFile(path, content);
			expect((await buildFlatFileEventStoreRepository(directory)).isLeft()).toBe(true);
			expect(await fs.readFile(path, "utf-8")).toBe(content);
		}
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

it("flat-file audit initialization retains additional historical event fields", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		await fs.mkdir(`${directory}/events/text_plain`, { recursive: true });
		const path = `${directory}/events/text_plain/audit_stream.json`;
		const historical = {
			...event,
			streamId: "audit_stream",
			sequence: 0,
			eventId: "legacy-event-id",
			tenant: "legacy-tenant",
		};
		await fs.writeFile(path, JSON.stringify([historical]));
		const repository = (await buildFlatFileEventStoreRepository(directory)).right;
		expect((await repository.getStream("audit_stream", "text/plain")).right).toEqual([
			historical,
		]);
		expect((await repository.append("audit_stream", "text/plain", event)).isRight()).toBe(true);
		expect(JSON.parse(await fs.readFile(path, "utf-8"))[0]).toEqual(historical);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

it("flat-file audit payloads remain immutable and noncloneable appends preserve disk", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		const repository = (await buildFlatFileEventStoreRepository(directory)).right;
		const appended = { ...event, payload: { nested: { values: ["original"] } } };
		const expected = { ...structuredClone(appended), streamId: "audit_stream", sequence: 0 };
		expect((await repository.append("audit_stream", "text/plain", appended)).isRight()).toBe(
			true,
		);
		const path = `${directory}/events/text_plain/audit_stream.json`;
		const before = await fs.readFile(path, "utf-8");
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
		expect(await fs.readFile(path, "utf-8")).toBe(before);
		expect((await repository.getStream("audit_stream", "text/plain")).right).toEqual([expected]);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});
