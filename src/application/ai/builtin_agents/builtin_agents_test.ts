import { describe, it } from "bdd";
import { expect } from "expect";
import { AgentDataSchema } from "domain/configuration/agent_schema.ts";
import { ASPECT_FIELD_EXTRACTOR_AGENT } from "./aspect_field_extractor_agent.ts";
import { createModelRuntime } from "../resolve_model.ts";
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

	it("RAG agent searches with find_documents only and gets the aspect catalog", () => {
		expect(ragAgent.exposedToUsers).toBe(true);
		expect(ragAgent.model).toEqual(["ollama-cloud/deepseek-v4.1-flash:cloud", "high"]);
		expect(ragAgent.tools).toEqual(["find_documents"]);
		expect(ragAgent.tools).not.toContain("semantic_search");
		expect(ragAgent.tools).not.toContain("run_code");
		expect(ragAgent.aspectCatalog).toBe(true);
		// The session manifest stores agents through the schema, which must keep the flag.
		expect(AgentDataSchema.parse(ragAgent).aspectCatalog).toBe(true);
	});

	it("RAG agent model is one the model runtime registers", async () => {
		const runtime = await createModelRuntime();
		const model = runtime.resolveModel(ragAgent.model![0]);
		expect(model.provider).toBe("ollama-cloud");
		expect(model.id).toBe("deepseek-v4.1-flash:cloud");
	});

	it("RAG agent prompt maps questions to filters or a query and bounds its claims", () => {
		const prompt = ragAgent.systemPrompt ?? "";
		expect(prompt).toContain("call only find_documents, and read");
		expect(prompt).not.toContain("semantic_search");
		expect(prompt).not.toContain("run_code");
		expect(prompt).toContain("Aspect catalog");
		expect(prompt).toContain("filters");
		expect(prompt).toContain("exact listed values");
		expect(prompt).toContain("retry once");
		expect(prompt).toContain('exact counts only from total when mode is "filters"');
		expect(prompt).toContain("Cite sources by title and uuid");
		expect(prompt).toContain("at most 5 tool calls");
	});
});
