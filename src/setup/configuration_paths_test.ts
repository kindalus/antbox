import { describe, it } from "bdd";
import { expect } from "expect";
import { join, resolve } from "node:path";
import type { TenantConfiguration } from "api/http_server_configuration.ts";
import {
	resolveConfigPath,
	resolveDataPath,
	resolveTenantConfigurationPaths,
} from "./configuration_paths.ts";

function tenant(overrides: Partial<TenantConfiguration> = {}): TenantConfiguration {
	return {
		name: "default",
		storage: ["flat_file/flat_file_storage_provider.ts", "default/storage"],
		repository: ["sqlite/sqlite_node_repository.ts", "./default/repository"],
		configurationRepository: ["sqlite/sqlite_configuration_repository.ts", "/config-db"],
		eventStoreRepository: ["sqlite/sqlite_event_store_repository.ts", "data/events"],
		limits: { storage: 1, tokens: 0 },
		...overrides,
	};
}

describe("configuration paths", () => {
	it("resolves relative data paths and preserves absolute paths", () => {
		const dataDir = resolve("/tmp/antbox-data");
		expect(resolveDataPath(dataDir, "vcrm")).toBe(join(dataDir, "vcrm"));
		expect(resolveDataPath(dataDir, "./vcrm")).toBe(join(dataDir, "vcrm"));
		expect(resolveDataPath(dataDir, "./data/vcrm")).toBe(join(dataDir, "data/vcrm"));
		expect(resolveDataPath(dataDir, "/vcrm")).toBe("/vcrm");
	});

	it("rejects empty and traversing data paths", () => {
		for (const path of ["", "../vcrm", "foo/../../vcrm", String.raw`foo\..\vcrm`]) {
			expect(() => resolveDataPath("/tmp/data", path)).toThrow();
		}
	});

	it("resolves configuration paths independently", () => {
		expect(resolveConfigPath("/etc/antbox", "service.json")).toBe(
			resolve("/etc/antbox/service.json"),
		);
		expect(resolveConfigPath("/etc/antbox", "/run/service.json")).toBe(
			"/run/service.json",
		);
	});

	it("resolves only declared adapter path parameters", () => {
		const configDir = resolve("/tmp/antbox-config");
		const dataDir = resolve("/tmp/antbox-data");
		const config = tenant({
			key: "tenant.key",
			jwks: "tenant.jwks",
			ai: {
				enabled: false,
				defaultModel: ["google/gemini-2.5-flash"],
				skillsPath: "skills",
				modelsPath: "models.json",
			},
		});

		resolveTenantConfigurationPaths(config, configDir, dataDir);

		expect(config.storage[1]).toBe(join(dataDir, "default/storage"));
		expect(config.repository[1]).toBe(join(dataDir, "default/repository"));
		expect(config.configurationRepository[1]).toBe("/config-db");
		expect(config.eventStoreRepository[1]).toBe(join(dataDir, "data/events"));
		expect(config.key).toBe(join(configDir, "tenant.key"));
		expect(config.jwks).toBe(join(configDir, "tenant.jwks"));
		expect(config.ai?.skillsPath).toBe(join(configDir, "skills"));
		expect(config.ai?.modelsPath).toBe(join(configDir, "models.json"));
	});

	it("leaves URLs, database names, and provider IDs untouched", () => {
		const configDir = resolve("/tmp/antbox-config");
		const dataDir = resolve("/tmp/antbox-data");
		const config = tenant({
			storage: [
				"google_drive/google_drive_storage_provider.ts",
				"service-account.json",
				"shared-drive-id",
			],
			repository: [
				"mongodb/mongodb_node_repository.ts",
				"mongodb://localhost:27017",
				"nodes",
			],
		});

		resolveTenantConfigurationPaths(config, configDir, dataDir);

		expect(config.storage).toEqual([
			"google_drive/google_drive_storage_provider.ts",
			join(configDir, "service-account.json"),
			"shared-drive-id",
		]);
		expect(config.repository).toEqual([
			"mongodb/mongodb_node_repository.ts",
			"mongodb://localhost:27017",
			"nodes",
		]);
	});
});
