import { describe, it } from "bdd";
import { expect } from "expect";
import { logMiddleware } from "./middleware.ts";

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
