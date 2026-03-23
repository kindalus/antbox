import { describe, it } from "bdd";
import { expect } from "expect";
import { AgentDataSchema } from "domain/configuration/agent_schema.ts";
import {
	customAgents,
	getCustomAgent,
	SEMANTIC_SEARCHER_AGENT,
	SEMANTIC_SEARCHER_AGENT_UUID,
} from "./index.ts";

describe("custom agents", () => {
	it("semantic searcher metadata passes schema validation", () => {
		const result = AgentDataSchema.safeParse(SEMANTIC_SEARCHER_AGENT);
		if (!result.success) {
			console.error("Validation errors:", result.error.issues);
		}
		expect(result.success).toBe(true);
	});

	it("semantic searcher metadata is exported in the custom registry", () => {
		expect(customAgents.map((agent) => agent.uuid)).toContain(SEMANTIC_SEARCHER_AGENT_UUID);
		expect(getCustomAgent(SEMANTIC_SEARCHER_AGENT_UUID)?.data).toEqual(SEMANTIC_SEARCHER_AGENT);
	});

	it("semantic searcher keeps its public metadata contract", () => {
		expect(SEMANTIC_SEARCHER_AGENT.type).toBe("llm");
		expect(SEMANTIC_SEARCHER_AGENT.exposedToUsers).toBe(false);
		expect(SEMANTIC_SEARCHER_AGENT.tools).toEqual(["runCode", "skillLoader"]);
		expect(SEMANTIC_SEARCHER_AGENT.systemPrompt).toBeDefined();
		expect(SEMANTIC_SEARCHER_AGENT.agents).toBeUndefined();
	});
});
