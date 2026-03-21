import { describe, it } from "bdd";
import { expect } from "expect";

import type { ServerConfiguration } from "api/http_server_configuration.ts";
import { getTenantSetupConfiguration } from "./main.ts";

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
