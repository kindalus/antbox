import { describe, it } from "bdd";
import { expect } from "expect";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";
import { createModelRuntime } from "./resolve_model.ts";

await loadPiCodingAgent();

async function withEnv(name: string, value: string, run: () => Promise<void>): Promise<void> {
	const original = Deno.env.get(name);
	Deno.env.set(name, value);
	try {
		await run();
	} finally {
		if (original === undefined) Deno.env.delete(name);
		else Deno.env.set(name, original);
	}
}

describe("Pi model runtime", () => {
	it("resolves models from Pi catalogs", async () => {
		const runtime = await createModelRuntime();
		const model = runtime.resolveModel("google/gemini-2.5-flash");
		expect(model.provider).toBe("google");
		expect(model.api).toBe("google-generative-ai");
		expect(runtime.listModels("google").length).toBeGreaterThan(0);
	});

	it("uses provider credentials from the environment", async () => {
		await withEnv("GEMINI_API_KEY", "google-key", async () => {
			const runtime = await createModelRuntime();
			expect(await runtime.getApiKey("google")).toBe("google-key");
			expect(await runtime.isConfigured("google")).toBe(true);
		});
	});

	it("rejects malformed and unknown model names", async () => {
		const runtime = await createModelRuntime();
		expect(() => runtime.resolveModel("missing-provider")).toThrow();
		expect(() => runtime.resolveModel("missing-provider/model")).toThrow();
	});
});
