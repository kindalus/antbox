import { describe, it } from "bdd";
import { expect } from "expect";

import {
	TenantConfigurationSchema,
	TenantsConfigurationSchema,
} from "./http_server_configuration.ts";

describe("TenantConfigurationSchema", () => {
	function makeTenantConfig() {
		return {
			name: "tenant-a",
			storage: ["inmem/inmem_storage_provider.ts"],
			database: ["inmem"],
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

	it("rejects blank root passwords without trimming valid passwords", () => {
		for (const rootPasswd of ["", "   "]) {
			expect(TenantConfigurationSchema.safeParse({ ...makeTenantConfig(), rootPasswd }).success)
				.toBe(false);
		}
		const rootPasswd = "  meaningful whitespace  ";
		expect(TenantConfigurationSchema.parse({ ...makeTenantConfig(), rootPasswd }).rootPasswd)
			.toBe(rootPasswd);
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

	it("normalizes legacy model strings and accepts explicit thinking levels", () => {
		const legacy = TenantConfigurationSchema.parse({
			...makeTenantConfig(),
			ai: { enabled: true, defaultModel: "google/gemini-2.5-flash" },
			limits: { storage: 25, tokens: 1 },
		});
		expect(legacy.ai?.defaultModel).toEqual(["google/gemini-2.5-flash"]);

		const explicit = TenantConfigurationSchema.parse({
			...makeTenantConfig(),
			ai: { enabled: true, defaultModel: ["google/gemini-2.5-flash", "medium"] },
			limits: { storage: 25, tokens: 1 },
		});
		expect(explicit.ai?.defaultModel).toEqual(["google/gemini-2.5-flash", "medium"]);
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

	it("rejects tenant names that cannot be used as filenames", () => {
		for (const name of ["Empresa A", "../tenant", "tenant_name", "-tenant"]) {
			const result = TenantConfigurationSchema.safeParse({ ...makeTenantConfig(), name });
			expect(result.success).toBe(false);
		}
	});

	it("rejects duplicate tenant names", () => {
		const tenant = makeTenantConfig();
		const result = TenantsConfigurationSchema.safeParse([tenant, tenant]);

		expect(result.success).toBe(false);
	});

	it("accepts every database kind with its parameters", () => {
		for (
			const database of [
				["postgres"],
				["postgres", "postgres://u:p@localhost/antbox"],
				["sqlite"],
				["sqlite", "./data"],
				["mongodb", "mongodb://localhost:27017", "antbox"],
				["inmem"],
			]
		) {
			const result = TenantConfigurationSchema.safeParse({ ...makeTenantConfig(), database });
			expect(result.success).toBe(true);
			if (result.success) expect<string[]>(result.data.database).toEqual(database);
		}
	});

	it("rejects unknown database kinds, including flat_file", () => {
		for (const kind of ["flat_file", "mysql", "sqlite/sqlite_node_repository.ts"]) {
			const result = TenantConfigurationSchema.safeParse({
				...makeTenantConfig(),
				database: [kind],
			});
			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues[0].message).toContain("postgres, sqlite, mongodb, inmem");
			}
		}
		expect(TenantConfigurationSchema.safeParse({ ...makeTenantConfig(), database: [] }).success)
			.toBe(false);
	});

	it("rejects wrong database parameter counts", () => {
		for (
			const database of [
				["postgres", "a", "b"],
				["sqlite", "a", "b"],
				["mongodb"],
				["mongodb", "mongodb://localhost:27017"],
				["mongodb", "a", "b", "c"],
				["inmem", "a"],
			]
		) {
			expect(TenantConfigurationSchema.safeParse({ ...makeTenantConfig(), database }).success)
				.toBe(false);
		}
	});

	it("refuses the legacy repository keys and suggests the replacement", () => {
		const { database: _database, ...base } = makeTenantConfig();
		const legacy = {
			...base,
			name: "acme",
			repository: ["sqlite/sqlite_node_repository.ts", "./data/repository"],
			configurationRepository: ["sqlite/sqlite_configuration_repository.ts", "./data/config"],
			eventStoreRepository: ["sqlite/sqlite_event_store_repository.ts", "./data/events"],
		};
		const result = TenantConfigurationSchema.safeParse(legacy);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.map((issue) => issue.message)).toEqual([
				'tenant "acme" uses repository, configurationRepository, eventStoreRepository, ' +
				'which are no longer supported; use database = ["sqlite", "./data"] instead',
			]);
		}
	});

	it("refuses legacy keys even next to a database entry and derives other backends", () => {
		const message = (repository: string[]) => {
			const result = TenantConfigurationSchema.safeParse({
				...makeTenantConfig(),
				repository,
			});
			return result.success ? undefined : result.error.issues[0].message;
		};

		expect(message(["inmem/inmem_node_repository.ts"])).toContain(
			'tenant "tenant-a" uses repository, which is no longer supported; ' +
				'use database = ["inmem"] instead',
		);
		const postgresMessage = message([
			"postgres/postgres_node_repository.ts",
			"postgres://user:s3cret@h/db",
		]);
		expect(postgresMessage).toContain('database = ["postgres", "<connection string>"]');
		expect(postgresMessage).not.toContain("s3cret");
		const mongoMessage = message([
			"mongodb/mongodb_node_repository.ts",
			"mongodb://user:s3cret@h:27017",
			"antbox",
		]);
		expect(mongoMessage).toContain('database = ["mongodb", "<url>", "<dbname>"]');
		expect(mongoMessage).not.toContain("s3cret");
		expect(message(["sqlite/sqlite_node_repository.ts"])).toContain('database = ["sqlite"]');
		expect(message(["flat_file/flat_file_node_repository.ts", "x"])).toContain(
			'database = ["<postgres|sqlite|mongodb|inmem>", ...]',
		);
	});
});
