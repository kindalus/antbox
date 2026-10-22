import { describe, it } from "bdd";
import { expect } from "expect";
import { corsMiddleware, logMiddleware } from "./middleware.ts";

describe("corsMiddleware", () => {
	it("permits cross-origin PATCH requests used by node, user, and workflow updates", async () => {
		let calls = 0;
		const handler = corsMiddleware(() => {
			calls++;
			return Promise.resolve(new Response("updated"));
		});
		const headers = {
			Origin: "https://client.example",
			"Access-Control-Request-Method": "PATCH",
		};
		const preflight = await handler(
			new Request("http://localhost/v2/nodes/node-001", {
				method: "OPTIONS",
				headers,
			}),
		);
		expect(preflight.status).toBe(204);
		expect(calls).toBe(0);
		expect(preflight.headers.get("Access-Control-Allow-Methods")?.split(/,\s*/)).toContain(
			"PATCH",
		);
		expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(headers.Origin);
		const response = await handler(
			new Request("http://localhost/v2/nodes/node-001", {
				method: "PATCH",
				headers,
			}),
		);
		expect(calls).toBe(1);
		expect(await response.text()).toBe("updated");
		expect(response.headers.get("Access-Control-Allow-Methods")?.split(/,\s*/)).toContain(
			"PATCH",
		);
	});
});

describe("logMiddleware", () => {
	it("logs request paths without query strings", async () => {
		const originalLevel = Deno.env.get("ANTBOX_LOG_LEVEL");
		const originalDebug = console.debug;
		const lines: string[] = [];
		Deno.env.set("ANTBOX_LOG_LEVEL", "debug");
		console.debug = (...args: unknown[]) => {
			lines.push(args.map(String).join(" "));
		};

		try {
			const handler = logMiddleware(() => Promise.resolve(new Response(null, { status: 200 })));
			await handler(new Request("http://localhost/v2/nodes?api_key=secret&x-tenant=demo"));
		} finally {
			if (originalLevel === undefined) {
				Deno.env.delete("ANTBOX_LOG_LEVEL");
			} else {
				Deno.env.set("ANTBOX_LOG_LEVEL", originalLevel);
			}
			console.debug = originalDebug;
		}

		const output = lines.join("\n");
		expect(output.includes("/v2/nodes")).toBe(true);
		expect(output.includes("api_key")).toBe(false);
		expect(output.includes("secret")).toBe(false);
	});
});
