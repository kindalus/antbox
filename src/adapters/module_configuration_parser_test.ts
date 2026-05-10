import { describe, it } from "bdd";
import { expect } from "expect";
import type { StorageProvider } from "application/nodes/storage_provider.ts";
import type { EventStoreRepository } from "domain/audit/event_store_repository.ts";
import type { ConfigurationRepository } from "domain/configuration/configuration_repository.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import { providerFrom } from "./module_configuration_parser.ts";

describe("providerFrom", () => {
	it("loads all configurable in-memory adapters through default factories", async () => {
		const configurationRepository = await providerFrom<ConfigurationRepository>([
			"inmem/inmem_configuration_repository.ts",
		]);
		const eventStoreRepository = await providerFrom<EventStoreRepository>([
			"inmem/inmem_event_store_repository.ts",
		]);
		const nodeRepository = await providerFrom<NodeRepository>([
			"inmem/inmem_node_repository.ts",
		]);
		const storageProvider = await providerFrom<StorageProvider>([
			"inmem/inmem_storage_provider.ts",
		]);

		expect(configurationRepository?.save).toBeDefined();
		expect(eventStoreRepository?.append).toBeDefined();
		expect(nodeRepository?.add).toBeDefined();
		expect(storageProvider?.write).toBeDefined();
	});
});
