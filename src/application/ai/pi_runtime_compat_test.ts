import { it } from "bdd";
import { expect } from "expect";
import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxProvider, fauxToolCall, Type } from "@earendil-works/pi-ai";
import { fromFileUrl } from "jsr:@std/path@1.1.2";
import { loadSkillInstruction, loadSkills } from "./skills_loader.ts";

it("Pi core loads an Antbox skill progressively in Deno", async () => {
	const builtinSkillsDir = fromFileUrl(new URL("./builtin_skills", import.meta.url));
	const skills = await loadSkills(builtinSkillsDir, undefined, {
		includeDocumentationSkills: false,
	});
	const skill = skills.find((candidate) => candidate.frontmatter.name === "sdk-consumer");
	if (!skill) throw new Error("sdk-consumer was not discovered");

	const skillParameters = Type.Object({ name: Type.String() });
	const loadSkill: AgentTool<typeof skillParameters> = {
		name: "load_skill",
		label: "Load skill",
		description: "Load one discovered skill",
		parameters: skillParameters,
		execute: async (_id, params) => {
			const requested = skills.find((candidate) => candidate.frontmatter.name === params.name);
			if (!requested) throw new Error("Unknown skill");
			const instruction = await loadSkillInstruction(requested.skillFile);
			if (!instruction) throw new Error("Invalid skill");
			return {
				content: [{ type: "text", text: instruction }],
				details: { skillDir: requested.skillDir },
			};
		},
	};

	const faux = fauxProvider({ provider: "skill-test" });
	faux.setResponses([
		(context) => {
			expect(context.systemPrompt).toContain("<name>sdk-consumer</name>");
			return fauxAssistantMessage(
				fauxToolCall("load_skill", { name: "sdk-consumer" }, { id: "skill-call" }),
				{ stopReason: "toolUse" },
			);
		},
		(context) => {
			const loaded = context.messages.some((message) =>
				message.role === "toolResult" &&
				message.content.some((content) =>
					content.type === "text" &&
					content.text.includes("SDK documentation specialist")
				)
			);
			expect(loaded).toBe(true);
			return fauxAssistantMessage("skill-loaded:sdk-consumer");
		},
	]);

	const systemPrompt = [
		"Use load_skill when a task matches.",
		"<available_skills>",
		`<skill><name>${skill.frontmatter.name}</name><description>${skill.frontmatter.description}</description><location>${skill.skillFile}</location></skill>`,
		"</available_skills>",
	].join("\n");
	const agent = new Agent({
		streamFn: (model, context, options) => faux.provider.streamSimple(model, context, options),
		initialState: {
			systemPrompt,
			model: faux.getModel(),
			thinkingLevel: "off",
			tools: [loadSkill],
		},
	});
	await agent.prompt("Use the Antbox SDK skill");

	expect(faux.state.callCount).toBe(2);
	const final = agent.state.messages.at(-1);
	expect(final?.role).toBe("assistant");
	if (final?.role === "assistant") {
		expect(
			final.content.some((content) =>
				content.type === "text" && content.text === "skill-loaded:sdk-consumer"
			),
		).toBe(true);
	}
});
