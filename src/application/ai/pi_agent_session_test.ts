import process from "node:process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import fs from "node:fs/promises";
import { describe, it } from "bdd";
import { expect } from "expect";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
	InMemoryCredentialStore,
	InMemoryModelsStore,
	type Message,
	Type,
} from "@earendil-works/pi-ai";
import { PiAgentSessionRunner } from "./pi_agent_session.ts";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";

const pi = await loadPiCodingAgent();

describe("PiAgentSessionRunner", () => {
	it("exposes only the supplied Antbox skills to Pi", async () => {
		const dir = await fs.mkdtemp(join(tmpdir(), "antbox-pi-skills-test-"));
		try {
			const skillDir = `${dir}/test-skill`;
			await fs.mkdir(skillDir);
			const skillFile = `${skillDir}/SKILL.md`;
			await fs.writeFile(
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
			await fs.rm(dir, { recursive: true });
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
		const manager = await runner.createInMemoryManager(process.cwd());
		const reported: Message[] = [];
		await expect(runner.run({
			cwd: process.cwd(),
			model: faux.getModel(),
			thinkingLevel: "off",
			systemPrompt: "Test timeout",
			tools: [slowTool],
			skills: [],
			sessionManager: manager,
			userText: "run",
			onFailure: (messages) => reported.push(...messages),
		})).rejects.toThrow("exceeded five minutes");
		expect(reported.some((message) => message.role === "assistant")).toBe(true);
	});

	it("reports the messages generated before a provider failure", async () => {
		const faux = fauxProvider({ provider: "failure-test" });
		faux.setResponses([
			fauxAssistantMessage(
				fauxToolCall("noop_tool", {}, { id: "noop-call" }),
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
		const runner = new PiAgentSessionRunner(runtime, 1_000);
		const parameters = Type.Object({});
		const noopTool: AgentTool<typeof parameters> = {
			name: "noop_tool",
			label: "Noop tool",
			description: "Completes immediately",
			parameters,
			execute: () => Promise.resolve({ content: [{ type: "text", text: "done" }], details: {} }),
		};
		const manager = await runner.createInMemoryManager(process.cwd());

		const reported: Message[] = [];
		await expect(runner.run({
			cwd: process.cwd(),
			model: faux.getModel(),
			thinkingLevel: "off",
			systemPrompt: "Test failure",
			tools: [noopTool],
			skills: [],
			sessionManager: manager,
			userText: "run",
			onFailure: (messages) => reported.push(...messages),
		})).rejects.toThrow("No more faux responses queued");

		const assistants = reported.filter((message) => message.role === "assistant");
		expect(faux.state.callCount).toBe(2);
		expect(assistants.length).toBe(2);
		expect(assistants[0].usage.totalTokens).toBeGreaterThan(0);
	});
});
