import { describe, it } from "bdd";
import { expect } from "expect";
import { FileNode } from "domain/nodes/file_node.ts";
import { toSqlValue } from "./bind.ts";
import { SqliteNodeRepository } from "./sqlite_node_repository.ts";
import { SqliteEventStoreRepository } from "./sqlite_event_store_repository.ts";

describe("toSqlValue", () => {
	it("binds safe integers as bigint and keeps other numbers as doubles", () => {
		expect(typeof toSqlValue(5)).toBe("bigint");
		expect(typeof toSqlValue(1.5)).toBe("number");
		expect(toSqlValue(true)).toBe(1n);
		expect(toSqlValue(undefined)).toBe(null);
	});

	it("matches a text column holding the string 500 with a numeric filter value", async () => {
		const repo = new SqliteNodeRepository();
		try {
			await repo.add(
				FileNode.create({
					uuid: "11111111-1111-4111-8111-111111111111",
					title: "500",
					mimetype: "application/pdf",
					owner: "tester@antbox.io",
					group: "testers",
				}).right,
			);
			const result = await repo.filter([["title", "==", 500]], 20, 1);
			expect(result.nodes).toHaveLength(1);
		} finally {
			repo.close();
		}
	});

	it("keeps sequence numbers and paging working as numbers", async () => {
		const store = new SqliteEventStoreRepository();
		const event = {
			eventType: "E",
			occurredOn: "2026-01-01T00:00:00.000Z",
			userEmail: "u@x.io",
			payload: {},
		};
		await store.append("s", "text/plain", event);
		await store.append("s", "text/plain", event);
		const stream = (await store.getStream("s", "text/plain")).right;
		expect(stream.map((e) => e.sequence)).toEqual([0, 1]);
		store.close();
	});
});
