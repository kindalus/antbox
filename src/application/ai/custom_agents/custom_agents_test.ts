import { describe, it } from "bdd";
import { expect } from "expect";
import { customAgents, getCustomAgent } from "./index.ts";

describe("custom agents", () => {
	it("has no built-in custom agent registrations", () => {
		expect(customAgents).toEqual([]);
	});

	it("does not register the builtin RAG agent as a custom runtime", () => {
		expect(getCustomAgent("--rag-agent--")).toBeUndefined();
	});
});
