import { describe, it } from "bdd";
import { expect } from "expect";

import { TenantConfigurationSchema } from "./http_server_configuration.ts";

describe("TenantConfigurationSchema", () => {
	function makeTenantConfig() {
		return {
			name: "tenant-a",
			storage: ["inmem/inmem_storage_provider.ts"],
			repository: ["inmem/inmem_node_repository.ts"],
			configurationRepository: ["inmem/inmem_configuration_repository.ts"],
			eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
			limits: {
				storage: 25,
				tokens: 0,
			},
		};
	}

	it("accepts zero token limit when AI is disabled", () => {
		const result = TenantConfigurationSchema.safeParse(makeTenantConfig());
		expect(result.success).toBe(true);
	});

	it("rejects pay-as-you-go token limit when AI is disabled", () => {
		const result = TenantConfigurationSchema.safeParse({
			...makeTenantConfig(),
			limits: {
				storage: 25,
				tokens: "pay-as-you-go",
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["limits", "tokens"]);
		}
	});

	it("rejects zero token limit when AI is enabled", () => {
		const result = TenantConfigurationSchema.safeParse({
			...makeTenantConfig(),
			ai: {
				enabled: true,
				defaultModel: "google/gemini-2.5-flash",
			},
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["limits", "tokens"]);
		}
	});

	it("accepts positive integer token limit when AI is enabled", () => {
		const result = TenantConfigurationSchema.safeParse({
			...makeTenantConfig(),
			ai: {
				enabled: true,
				defaultModel: "google/gemini-2.5-flash",
			},
			limits: {
				storage: 25,
				tokens: 2,
			},
		});

		expect(result.success).toBe(true);
	});

	it("accepts pay-as-you-go token limit when AI is enabled", () => {
		const result = TenantConfigurationSchema.safeParse({
			...makeTenantConfig(),
			ai: {
				enabled: true,
				defaultModel: "google/gemini-2.5-flash",
			},
			limits: {
				storage: "pay-as-you-go",
				tokens: "pay-as-you-go",
			},
		});

		expect(result.success).toBe(true);
	});

	it("rejects non-integer token limit", () => {
		const result = TenantConfigurationSchema.safeParse({
			...makeTenantConfig(),
			ai: {
				enabled: true,
				defaultModel: "google/gemini-2.5-flash",
			},
			limits: {
				storage: 25,
				tokens: 1.5,
			},
		});

		expect(result.success).toBe(false);
	});

	it("rejects empty symmetric key paths", () => {
		const result = TenantConfigurationSchema.safeParse({
			...makeTenantConfig(),
			key: "",
		});

		expect(result.success).toBe(false);
	});

	it("rejects empty jwks paths", () => {
		const result = TenantConfigurationSchema.safeParse({
			...makeTenantConfig(),
			jwks: "",
		});

		expect(result.success).toBe(false);
	});
});
