import { describe, it } from "bdd";
import { expect } from "expect";
import { fromFileUrl } from "jsr:@std/path@1.1.2";
import { buildToolSet, type BuildToolSetContext } from "./build_tools.ts";
import { loadSkills } from "./skills_loader.ts";
import { right } from "shared/either.ts";
import type { AgentData } from "domain/configuration/agent_data.ts";
import type { FeatureData } from "domain/configuration/feature_data.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";

const authContext: AuthenticationContext = {
	tenant: "tenant",
	principal: { email: "user@example.com", groups: [] },
	mode: "Direct",
};

function agent(overrides: Partial<AgentData> = {}): AgentData {
	return {
		uuid: "test-agent",
		name: "Test",
		exposedToUsers: true,
		createdTime: "2026-01-01T00:00:00.000Z",
		modifiedTime: "2026-01-01T00:00:00.000Z",
		...overrides,
	};
}

function context(overrides: Partial<BuildToolSetContext> = {}): BuildToolSetContext {
	return {
		nodeService: {} as BuildToolSetContext["nodeService"],
		aspectsService: {} as BuildToolSetContext["aspectsService"],
		featuresService: {
			listAITools: () => Promise.resolve(right([])),
		} as unknown as BuildToolSetContext["featuresService"],
		skills: [],
		...overrides,
	};
}

describe("buildToolSet", () => {
	it("builds Pi tools and keeps load_skill as the default", async () => {
		const built = await buildToolSet(context(), agent(), authContext);
		expect(built.isRight()).toBe(true);
		if (built.isLeft()) throw built.value;
		expect(built.value.toolNames).toEqual(["load_skill"]);
		expect(built.value.tools[0].name).toBe("load_skill");
		expect((built.value.tools[0].parameters as { type?: string }).type).toBe("object");
	});

	it("loads only skills allowed for the agent", async () => {
		const builtinSkillsDir = fromFileUrl(new URL("./builtin_skills", import.meta.url));
		const skills = await loadSkills(builtinSkillsDir, undefined, {
			includeDocumentationSkills: false,
		});
		const built = await buildToolSet(
			context({ skills }),
			agent({ skills: ["sdk-consumer"] }),
			authContext,
		);
		if (built.isLeft()) throw built.value;
		const loadSkill = built.value.tools.find((tool) => tool.name === "load_skill");
		if (!loadSkill) throw new Error("load_skill missing");
		const result = await loadSkill.execute("call", { name: "sdk-consumer" });
		expect(result.content[0].type).toBe("text");
		if (result.content[0].type === "text") {
			expect(result.content[0].text).toContain("SDK documentation specialist");
			expect(result.content[0].text).not.toContain("name: sdk-consumer");
		}
		await expect(loadSkill.execute("call", { name: "unknown" })).rejects.toThrow();
	});

	it("maps feature aliases and parameters for Pi execution", async () => {
		const feature: FeatureData = {
			uuid: "calculateTotal",
			title: "Calculate total",
			description: "Calculate a total",
			exposeAction: false,
			runOnCreates: false,
			runOnUpdates: false,
			runOnDeletes: false,
			runOnEmbeddingsCreated: false,
			runOnEmbeddingsUpdated: false,
			runManually: false,
			filters: [],
			exposeExtension: false,
			exposeAITool: true,
			groupsAllowed: [],
			parameters: [{ name: "itemCount", type: "number", required: true }],
			returnType: "object",
			run: "",
			createdTime: "2026-01-01T00:00:00.000Z",
			modifiedTime: "2026-01-01T00:00:00.000Z",
		};
		let received: Record<string, unknown> | undefined;
		const built = await buildToolSet(
			context({
				featuresService: {
					listAITools: () => Promise.resolve(right([feature])),
				} as unknown as BuildToolSetContext["featuresService"],
				featureAIToolExecutor: {
					runAITool: <T>(
						_ctx: AuthenticationContext,
						_uuid: string,
						parameters: Record<string, unknown>,
					) => {
						received = parameters;
						return Promise.resolve(right({ total: 4 } as T));
					},
				},
			}),
			agent({ tools: ["calculateTotal"] }),
			authContext,
		);
		if (built.isLeft()) throw built.value;
		expect(built.value.toolNames).toEqual(["load_skill", "calculate_total"]);
		const tool = built.value.tools.find((candidate) => candidate.name === "calculate_total");
		if (!tool) throw new Error("feature tool missing");
		const result = await tool.execute("call", { item_count: 4 });
		expect(received).toEqual({ itemCount: 4 });
		expect(result.content).toEqual([{ type: "text", text: '{"total":4}' }]);
	});
});
