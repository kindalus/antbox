import { describe, it } from "bdd";
import { expect } from "expect";
import {
	fauxAssistantMessage,
	fauxProvider,
	InMemoryCredentialStore,
	InMemoryModelsStore,
} from "@earendil-works/pi-ai";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";

const pi = await loadPiCodingAgent();

async function createTestRuntime() {
	const runtime = await pi.ModelRuntime.create({
		credentials: new InMemoryCredentialStore(),
		modelsPath: null,
		modelsStore: new InMemoryModelsStore(),
		refreshOnCreate: false,
	});
	return runtime;
}

describe("Pi coding agent compatibility", () => {
	it("runs and reopens a persisted session in Deno", async () => {
		const dir = await Deno.makeTempDir({ prefix: "antbox-pi-session-test-" });
		try {
			const runtime = await createTestRuntime();
			const faux = fauxProvider({ provider: "antbox-test" });
			faux.setResponses([
				fauxAssistantMessage("first-answer"),
				(context) => {
					expect(
						context.messages.some((message) =>
							message.role === "assistant" &&
							message.content.some((part) =>
								part.type === "text" && part.text === "first-answer"
							)
						),
					).toBe(true);
					return fauxAssistantMessage("second-answer");
				},
			]);
			runtime.registerNativeProvider(faux.provider);

			const loader = new pi.DefaultResourceLoader({
				cwd: dir,
				agentDir: dir,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				systemPrompt: "Antbox compatibility test",
			});
			await loader.reload();
			const settingsManager = pi.SettingsManager.inMemory();
			const manager = pi.SessionManager.create(dir, dir, { id: crypto.randomUUID() });
			const first = await pi.createAgentSession({
				cwd: dir,
				agentDir: dir,
				model: faux.getModel(),
				thinkingLevel: "off",
				modelRuntime: runtime,
				resourceLoader: loader,
				settingsManager,
				sessionManager: manager,
				noTools: "all",
			});
			await first.session.prompt("first-question");
			first.session.dispose();

			const sessionFile = manager.getSessionFile();
			expect(sessionFile).toBeDefined();
			const reopened = pi.SessionManager.open(sessionFile!);
			const second = await pi.createAgentSession({
				cwd: dir,
				agentDir: dir,
				model: faux.getModel(),
				thinkingLevel: "off",
				modelRuntime: runtime,
				resourceLoader: loader,
				settingsManager,
				sessionManager: reopened,
				noTools: "all",
			});
			await second.session.prompt("second-question");
			expect(second.session.messages.at(-1)?.role).toBe("assistant");
			second.session.dispose();
			expect(faux.state.callCount).toBe(2);
		} finally {
			await Deno.remove(dir, { recursive: true });
		}
	});
});
