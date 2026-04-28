import { describe, it } from "bdd";
import { expect } from "expect";
import { AgentDataSchema } from "domain/configuration/agent_schema.ts";
import { ASPECT_FIELD_EXTRACTOR_AGENT } from "./aspect_field_extractor_agent.ts";
import { ragAgent } from "./rag_agent.ts";

describe("builtin agents schema validation", () => {
	it("RAG agent metadata passes schema validation", () => {
		const result = AgentDataSchema.safeParse(ragAgent);
		if (!result.success) {
			console.error("Validation errors:", result.error.issues);
		}
		expect(result.success).toBe(true);
	});

	it("aspect field extractor agent passes schema validation", () => {
		const result = AgentDataSchema.safeParse(ASPECT_FIELD_EXTRACTOR_AGENT);
		if (!result.success) {
			console.error("Validation errors:", result.error.issues);
		}
		expect(result.success).toBe(true);
	});

	it("RAG agent metadata stays prompt-driven and retrieval-focused", () => {
		expect(ragAgent.exposedToUsers).toBe(true);
		expect(ragAgent.systemPrompt?.length ?? 0).toBeGreaterThan(0);
		expect(ragAgent.systemPrompt).toContain("semantic_search");
		expect(ragAgent.systemPrompt).toContain("Before answering");
		expect(ragAgent.model).toBe("default");
		expect(ragAgent.tools).toEqual(["semantic_search"]);
	});
});
