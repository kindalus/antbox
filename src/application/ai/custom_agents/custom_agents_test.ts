import { describe, it } from "bdd";
import { expect } from "expect";
import { AgentDataSchema } from "domain/configuration/agent_schema.ts";
import { customAgents, getCustomAgent, RAG_AGENT, RAG_AGENT_UUID } from "./index.ts";

describe("custom agents", () => {
	it("RAG agent metadata passes schema validation", () => {
		const result = AgentDataSchema.safeParse(RAG_AGENT);
		if (!result.success) {
			console.error("Validation errors:", result.error.issues);
		}
		expect(result.success).toBe(true);
	});

	it("RAG metadata is exported in the custom registry", () => {
		expect(customAgents.map((agent) => agent.uuid)).toContain(RAG_AGENT_UUID);
		expect(getCustomAgent(RAG_AGENT_UUID)?.data).toEqual(RAG_AGENT);
	});

	it("RAG keeps its public metadata contract", () => {
		expect(RAG_AGENT.type).toBe("sequential");
		expect(RAG_AGENT.exposedToUsers).toBe(true);
		expect(RAG_AGENT.agents).toEqual([
			"rag_inline_query_rewrite",
			"rag_inline_keyword_fallback",
			"rag_inline_summarizer",
		]);
	});
});
