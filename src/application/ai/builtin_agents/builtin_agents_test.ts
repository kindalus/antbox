import { describe, it } from "bdd";
import { expect } from "expect";
import { AgentDataSchema } from "domain/configuration/agent_schema.ts";
import { SEMANTIC_SEARCHER_AGENT } from "./semantic_searcher_agent.ts";
import { RAG_SUMMARIZER_AGENT } from "./rag_summarizer_agent.ts";
import { ragAgent } from "./rag_agent.ts";

describe("builtin agents schema validation", () => {
	it("semantic searcher agent passes schema validation", () => {
		const result = AgentDataSchema.safeParse(SEMANTIC_SEARCHER_AGENT);
		if (!result.success) {
			console.error("Validation errors:", result.error.issues);
		}
		expect(result.success).toBe(true);
	});

	it("RAG summarizer agent passes schema validation", () => {
		const result = AgentDataSchema.safeParse(RAG_SUMMARIZER_AGENT);
		if (!result.success) {
			console.error("Validation errors:", result.error.issues);
		}
		expect(result.success).toBe(true);
	});

	it("RAG agent (sequential) passes schema validation", () => {
		const result = AgentDataSchema.safeParse(ragAgent);
		if (!result.success) {
			console.error("Validation errors:", result.error.issues);
		}
		expect(result.success).toBe(true);
	});

	it("semantic searcher has correct type and tools", () => {
		expect(SEMANTIC_SEARCHER_AGENT.type).toBe("llm");
		expect(SEMANTIC_SEARCHER_AGENT.tools).toEqual(["runCode"]);
		expect(SEMANTIC_SEARCHER_AGENT.systemPrompt).toBeDefined();
		expect(SEMANTIC_SEARCHER_AGENT.agents).toBeUndefined();
	});

	it("RAG summarizer has empty tools list", () => {
		expect(RAG_SUMMARIZER_AGENT.type).toBe("llm");
		expect(RAG_SUMMARIZER_AGENT.tools).toEqual([]);
		expect(RAG_SUMMARIZER_AGENT.systemPrompt).toBeDefined();
		expect(RAG_SUMMARIZER_AGENT.agents).toBeUndefined();
	});

	it("RAG agent is a sequential workflow with two sub-agents", () => {
		expect(ragAgent.type).toBe("sequential");
		expect(ragAgent.agents).toHaveLength(2);
		expect(ragAgent.agents).toContain("--semantic-searcher-agent--");
		expect(ragAgent.agents).toContain("--rag-summarizer-agent--");
		expect(ragAgent.systemPrompt).toBeUndefined();
		expect(ragAgent.model).toBeUndefined();
		expect(ragAgent.tools).toBeUndefined();
	});
});
