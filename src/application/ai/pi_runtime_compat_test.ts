import { it } from "bdd";
import { expect } from "expect";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	InMemoryCredentialStore,
	InMemoryModelsStore,
} from "@earendil-works/pi-ai";
import { fileURLToPath } from "node:url";
import { PiAgentSessionRunner } from "./pi_agent_session.ts";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";
import { createSkillReadTool } from "./skill_read_tool.ts";
import { loadSkills } from "./skills_loader.ts";

it("Pi lists an Antbox skill and the model loads it progressively with read", async () => {
	const pi = await loadPiCodingAgent();
	const builtinSkillsDir = fileURLToPath(new URL("./builtin_skills", import.meta.url));
	const skills = await loadSkills(builtinSkillsDir, undefined, {
		includeDocumentationSkills: false,
	});
	const skill = skills.find((candidate) => candidate.frontmatter.name === "sdk-consumer");
	if (!skill) throw new Error("sdk-consumer was not discovered");

	const faux = fauxProvider({ provider: "skill-test" });
	faux.setResponses([
		(context) => {
			// Level 1: only name, description and location are in the prompt, not the body.
			expect(context.systemPrompt).toContain("<name>sdk-consumer</name>");
			expect(context.systemPrompt).toContain(skill.skillFile);
			expect(context.systemPrompt).not.toContain("SDK documentation specialist");
			return fauxAssistantMessage(
				fauxToolCall("read", { path: skill.skillFile }, { id: "skill-call" }),
				{ stopReason: "toolUse" },
			);
		},
		(context) => {
			// Level 2: the body arrives as the result of the read call.
			const loaded = context.messages.some((message) =>
				message.role === "toolResult" && !message.isError &&
				message.content.some((content) =>
					content.type === "text" && content.text.includes("SDK documentation specialist")
				)
			);
			expect(loaded).toBe(true);
			return fauxAssistantMessage("skill-loaded:sdk-consumer");
		},
	]);
	const runtime = await pi.ModelRuntime.create({
		credentials: new InMemoryCredentialStore(),
		modelsPath: null,
		modelsStore: new InMemoryModelsStore(),
		refreshOnCreate: false,
	});
	runtime.registerNativeProvider(faux.provider);
	const runner = new PiAgentSessionRunner(runtime, 5_000);
	const output = await runner.run({
		cwd: process.cwd(),
		model: faux.getModel(),
		thinkingLevel: "off",
		systemPrompt: "Use skills when a task matches.",
		tools: [await createSkillReadTool([skill])],
		skills: [skill],
		sessionManager: await runner.createInMemoryManager(process.cwd()),
		userText: "Use the Antbox SDK skill",
	});

	expect(faux.state.callCount).toBe(2);
	const final = output.messages.at(-1);
	expect(final?.role).toBe("assistant");
	if (final?.role === "assistant") {
		expect(
			final.content.some((content) =>
				content.type === "text" && content.text === "skill-loaded:sdk-consumer"
			),
		).toBe(true);
	}
});
