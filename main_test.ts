import { describe, it } from "bdd";
import { expect } from "expect";

import type { ServerConfiguration } from "api/http_server_configuration.ts";
import { createAdkLogger, getTenantSetupConfiguration } from "./main.ts";

describe("getTenantSetupConfiguration", () => {
	it("preserves global auth settings for tenant setup", () => {
		const config: ServerConfiguration = {
			engine: "oak",
			port: 7180,
			rootPasswd: "demo",
			key: "./.config/antbox.key",
			jwks: "http://localhost:8099/.well-known/jwks.json",
			tenants: [{
				name: "demox",
				storage: ["inmem/inmem_storage_provider.ts"],
				repository: ["inmem/inmem_node_repository.ts"],
				configurationRepository: ["./src/adapters/.tmp-test-config.ts"],
				eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
				limits: {
					storage: 10,
					tokens: 0,
				},
			}],
		};

		expect(getTenantSetupConfiguration(config)).toEqual(config);
	});
});

describe("createAdkLogger", () => {
	it("routes ADK info logs to the main debug logger", () => {
		const originalLevel = Deno.env.get("ANTBOX_LOG_LEVEL");
		const originalDebug = console.debug;
		const messages: unknown[][] = [];

		Deno.env.set("ANTBOX_LOG_LEVEL", "debug");
		console.debug = (...args: unknown[]) => {
			messages.push(args);
		};

		try {
			createAdkLogger().info("sensitive info");
		} finally {
			console.debug = originalDebug;
			if (originalLevel === undefined) {
				Deno.env.delete("ANTBOX_LOG_LEVEL");
			} else {
				Deno.env.set("ANTBOX_LOG_LEVEL", originalLevel);
			}
		}

		expect(messages).toHaveLength(1);
		expect(messages[0]?.[0]).toBe("[DEBUG]");
		expect(messages[0]?.[1]).toBe("[ADK]");
		expect(messages[0]?.[2]).toBe("sensitive info");
	});
});
