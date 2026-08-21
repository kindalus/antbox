import { describe, it } from "bdd";
import { expect } from "expect";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	InMemoryCredentialStore,
	InMemoryModelsStore,
	Type,
} from "@earendil-works/pi-ai";
import { PiAgentSessionRunner } from "./pi_agent_session.ts";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";

const pi = await loadPiCodingAgent();

describe("PiAgentSessionRunner", () => {
	it("exposes only the supplied Antbox skills to Pi", async () => {
		const dir = await Deno.makeTempDir({ prefix: "antbox-pi-skills-test-" });
		try {
			const skillDir = `${dir}/test-skill`;
			await Deno.mkdir(skillDir);
			const skillFile = `${skillDir}/SKILL.md`;
			await Deno.writeTextFile(
				skillFile,
				"---\nname: test-skill\ndescription: Test skill\n---\nInstructions",
			);
			const faux = fauxProvider({ provider: "skills-test" });
			faux.setResponses([
				(context) => {
					expect(context.systemPrompt).toContain("test-skill");
					return fauxAssistantMessage("skill-visible");
				},
			]);
			const runtime = await pi.ModelRuntime.create({
				credentials: new InMemoryCredentialStore(),
				modelsPath: null,
				modelsStore: new InMemoryModelsStore(),
				refreshOnCreate: false,
			});
			runtime.registerNativeProvider(faux.provider);
			const runner = new PiAgentSessionRunner(runtime, 1_000);
			const manager = await runner.createInMemoryManager(dir);
			const output = await runner.run({
				cwd: dir,
				model: faux.getModel(),
				thinkingLevel: "off",
				systemPrompt: "Only Antbox resources are allowed.",
				tools: [],
				skills: [{
					frontmatter: { name: "test-skill", description: "Test skill" },
					skillDir,
					skillFile,
				}],
				sessionManager: manager,
				userText: "run",
			});
			expect(output.messages.at(-1)?.role).toBe("assistant");
		} finally {
			await Deno.remove(dir, { recursive: true });
		}
	});

	it("aborts a run at its internal deadline", async () => {
		const faux = fauxProvider({ provider: "timeout-test" });
		faux.setResponses([
			fauxAssistantMessage(
				fauxToolCall("slow_tool", {}, { id: "slow-call" }),
				{ stopReason: "toolUse" },
			),
		]);
		const runtime = await pi.ModelRuntime.create({
			credentials: new InMemoryCredentialStore(),
			modelsPath: null,
			modelsStore: new InMemoryModelsStore(),
			refreshOnCreate: false,
		});
		runtime.registerNativeProvider(faux.provider);
		const runner = new PiAgentSessionRunner(runtime, 5);
		const parameters = Type.Object({});
		const slowTool: AgentTool<typeof parameters> = {
			name: "slow_tool",
			label: "Slow tool",
			description: "Waits long enough to trigger the deadline",
			parameters,
			execute: async () => {
				await new Promise((resolve) => setTimeout(resolve, 30));
				return { content: [{ type: "text", text: "done" }], details: {} };
			},
		};
		const manager = await runner.createInMemoryManager(Deno.cwd());
		await expect(runner.run({
			cwd: Deno.cwd(),
			model: faux.getModel(),
			thinkingLevel: "off",
			systemPrompt: "Test timeout",
			tools: [slowTool],
			skills: [],
			sessionManager: manager,
			userText: "run",
		})).rejects.toThrow("exceeded five minutes");
	});
});
