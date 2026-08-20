import { describe, it } from "bdd";
import { expect } from "expect";
import { PiModelRuntime } from "./resolve_model.ts";

const noEnv = () => undefined;

describe("PiModelRuntime", () => {
	it("resolves known and configured custom models", () => {
		const runtime = new PiModelRuntime({
			googleApiKey: "google-key",
			env: noEnv,
		});

		const known = runtime.resolveModel("google/gemini-2.5-flash");
		expect(known.provider).toBe("google");
		expect(known.api).toBe("google-generative-ai");

		const custom = runtime.resolveModel("google/future-gemini-model");
		expect(custom.id).toBe("future-gemini-model");
		expect(runtime.listModels("google").some((model) => model.id === custom.id)).toBe(true);
	});

	it("enumerates only supported provider catalogs", () => {
		const runtime = new PiModelRuntime({ env: noEnv });
		expect(runtime.listModels("google").length).toBeGreaterThan(0);
		expect(runtime.listModels("openai").length).toBeGreaterThan(0);
		expect(runtime.listModels("anthropic").length).toBeGreaterThan(0);
		expect(runtime.listModels("unsupported")).toEqual([]);
	});

	it("supplies explicit API keys", async () => {
		const runtime = new PiModelRuntime({
			googleApiKey: "google-key",
			openaiApiKey: "openai-key",
			anthropicApiKey: "anthropic-key",
			env: noEnv,
		});

		expect(await runtime.getApiKey("google")).toBe("google-key");
		expect(await runtime.getApiKey("openai")).toBe("openai-key");
		expect(await runtime.getApiKey("anthropic")).toBe("anthropic-key");
		expect(await runtime.isConfigured("google")).toBe(true);
	});

	it("preserves GOOGLE_API_KEY as a Gemini fallback", async () => {
		const runtime = new PiModelRuntime({
			env: (name) => name === "GOOGLE_API_KEY" ? "legacy-google-key" : undefined,
		});
		expect(await runtime.getApiKey("google")).toBe("legacy-google-key");
	});

	it("treats Ollama as keyless and preserves its base URL", async () => {
		const runtime = new PiModelRuntime({
			ollamaBaseUrl: "http://ollama.test/v1",
			env: noEnv,
		});
		const model = runtime.resolveModel("ollama/qwen3");
		expect(model.baseUrl).toBe("http://ollama.test/v1");
		expect(await runtime.getApiKey("ollama")).toBe("ollama");
		expect(await runtime.isConfigured("ollama")).toBe(true);
	});

	it("rejects malformed and unsupported model strings", () => {
		const runtime = new PiModelRuntime({ env: noEnv });
		expect(() => runtime.resolveModel("missing-provider")).toThrow();
		expect(() => runtime.resolveModel("mistral/model")).toThrow();
	});
});
