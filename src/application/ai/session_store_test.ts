import { describe, it } from "bdd";
import { expect } from "expect";
import { SessionStore } from "./session_store.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";

const baseAgent: AgentData = {
	uuid: "a-1",
	name: "A",
	exposedToUsers: true,
	createdTime: "2026-05-01T00:00:00.000Z",
	modifiedTime: "2026-05-01T00:00:00.000Z",
};

function makeSnapshot(id: string) {
	return {
		sessionId: id,
		tenant: "t",
		userEmail: "u@x",
		agentUuid: "a-1",
		agentData: baseAgent,
		tools: {},
		toolNames: ["load_skill"] as readonly string[],
	};
}

describe("SessionStore", () => {
	it("stores and retrieves a snapshot", () => {
		const store = new SessionStore();
		const stored = store.put(makeSnapshot("s1"));
		const got = store.get("s1");
		expect(got?.sessionId).toBe(stored.sessionId);
		expect(got?.toolNames).toEqual(["load_skill"]);
	});

	it("returns undefined for unknown session", () => {
		const store = new SessionStore();
		expect(store.get("missing")).toBeUndefined();
	});

	it("evicts after sliding TTL elapses", () => {
		let now = 0;
		const store = new SessionStore({ ttlMs: 100, hardTtlMs: 10_000, clock: () => now });
		store.put(makeSnapshot("s1"));
		now = 50;
		expect(store.get("s1")).toBeDefined();
		now = 50 + 101;
		expect(store.get("s1")).toBeUndefined();
	});

	it("sliding TTL extends on access", () => {
		let now = 0;
		const store = new SessionStore({ ttlMs: 100, hardTtlMs: 10_000, clock: () => now });
		store.put(makeSnapshot("s1"));
		now = 50;
		store.get("s1"); // refreshes lastUsed
		now = 50 + 99;
		expect(store.get("s1")).toBeDefined();
	});

	it("hard TTL evicts even on active access", () => {
		let now = 0;
		const store = new SessionStore({ ttlMs: 1_000_000, hardTtlMs: 200, clock: () => now });
		store.put(makeSnapshot("s1"));
		now = 100;
		expect(store.get("s1")).toBeDefined();
		now = 250;
		expect(store.get("s1")).toBeUndefined();
	});

	it("LRU evicts oldest when exceeding maxEntries", () => {
		const store = new SessionStore({ maxEntries: 2 });
		store.put(makeSnapshot("s1"));
		store.put(makeSnapshot("s2"));
		store.put(makeSnapshot("s3"));
		expect(store.get("s1")).toBeUndefined();
		expect(store.get("s2")).toBeDefined();
		expect(store.get("s3")).toBeDefined();
	});

	it("delete removes a session", () => {
		const store = new SessionStore();
		store.put(makeSnapshot("s1"));
		expect(store.delete("s1")).toBe(true);
		expect(store.get("s1")).toBeUndefined();
		expect(store.delete("s1")).toBe(false);
	});
});
