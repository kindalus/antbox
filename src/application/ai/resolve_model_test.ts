import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { describe, it } from "bdd";
import { expect } from "expect";
import { loadPiCodingAgent } from "./pi_coding_agent.ts";
import { createModelRuntime } from "./resolve_model.ts";

await loadPiCodingAgent();

async function withEnv(name: string, value: string, run: () => Promise<void>): Promise<void> {
	const original = process.env[name];
	process.env[name] = value;
	try {
		await run();
	} finally {
		if (original === undefined) delete process.env[name];
		else process.env[name] = original;
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

	it("registers Ollama Cloud models that read OLLAMA_API_KEY", async () => {
		await withEnv("OLLAMA_API_KEY", "ollama-key", async () => {
			const runtime = await createModelRuntime();
			for (const name of ["deepseek-v4.1-flash", "deepseek-v4.1-flash:cloud"]) {
				const model = runtime.resolveModel(`ollama-cloud/${name}`);
				expect(model.id).toBe(name);
				expect(model.api).toBe("openai-completions");
				expect(model.baseUrl).toBe("https://ollama.com/v1");
				expect(model.reasoning).toBe(true);
			}
			expect(await runtime.getApiKey("ollama-cloud")).toBe("ollama-key");
			expect(await runtime.isConfigured("ollama-cloud")).toBe(true);
		});
	});

	it("sends Ollama Cloud requests with the key and the model's thinking values", async () => {
		const bodies: Record<string, unknown>[] = [];
		const original = globalThis.fetch;
		globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ollama-key");
			bodies.push(JSON.parse(String(init?.body)));
			return new Response("unavailable", { status: 503 });
		}) as typeof fetch;
		try {
			await withEnv("OLLAMA_API_KEY", "ollama-key", async () => {
				const runtime = await createModelRuntime();
				const model = runtime.resolveModel("ollama-cloud/deepseek-v4.1-flash");
				for (const reasoning of ["high", "medium", undefined]) {
					const context = {
						systemPrompt: "system",
						messages: [{ role: "user", content: "hi", timestamp: Date.now() }],
					};
					const stream = runtime.streamFn(model, context as never, { reasoning } as never);
					for await (const event of stream as AsyncIterable<{ type: string }>) {
						if (event.type === "error" || event.type === "done") break;
					}
				}
			});
		} finally {
			globalThis.fetch = original;
		}
		expect(bodies.map((body) => body.reasoning_effort)).toEqual(["high", "high", "none"]);
		expect(bodies[0].model).toBe("deepseek-v4.1-flash");
		expect(bodies[0].max_tokens).toBe(65536);
		expect((bodies[0].messages as { role: string }[])[0].role).toBe("system");
	});

	it("lets a tenant models.json replace a built-in provider", async () => {
		const dir = await mkdtemp(join(tmpdir(), "antbox-models-"));
		try {
			const modelsPath = join(dir, "models.json");
			await writeFile(
				modelsPath,
				JSON.stringify({
					providers: {
						"ollama-cloud": {
							baseUrl: "https://ollama.example/v1",
							api: "openai-completions",
							apiKey: "tenant-key",
							models: [{ id: "deepseek-v4.1-flash" }],
						},
					},
				}),
			);
			const runtime = await createModelRuntime(modelsPath);
			const model = runtime.resolveModel("ollama-cloud/deepseek-v4.1-flash");
			expect(model.baseUrl).toBe("https://ollama.example/v1");
			expect(await runtime.getApiKey("ollama-cloud")).toBe("tenant-key");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
