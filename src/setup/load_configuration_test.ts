import { describe, it } from "bdd";
import { expect } from "expect";
import { join } from "node:path";
import { stringify } from "toml";
import type { TenantConfiguration } from "api/http_server_configuration.ts";
import { loadConfiguration } from "./load_configuration.ts";
import { TENANT_SAMPLE_FILE } from "./tenant_configuration_files.ts";

function tenant(name: string, storagePath?: string): TenantConfiguration {
	return {
		name,
		storage: storagePath
			? ["inmem/inmem_storage_provider.ts", storagePath]
			: ["inmem/inmem_storage_provider.ts"],
		repository: ["inmem/inmem_node_repository.ts"],
		configurationRepository: ["inmem/inmem_configuration_repository.ts"],
		eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
		limits: { storage: 10, tokens: 0 },
	};
}

function tenantToml(name: string, storagePath?: string): string {
	return stringify({ ...tenant(name, storagePath) });
}

async function withConfigDir(
	config: Record<string, unknown>,
	run: (dir: string) => Promise<void>,
): Promise<void> {
	const dir = await Deno.makeTempDir({ prefix: "antbox-config-test-" });
	try {
		await Deno.writeTextFile(join(dir, "config.toml"), stringify(config));
		await run(dir);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
}

describe("loadConfiguration", () => {
	it("merges tenant files in canonical order and lets files override inline tenants", async () => {
		await withConfigDir(
			{ engine: "oak", tenants: [tenant("default"), tenant("zeta")] },
			async (dir) => {
				const tenantsDir = join(dir, "tenants.d");
				await Deno.mkdir(tenantsDir);
				await Deno.writeTextFile(
					join(tenantsDir, "default.toml"),
					tenantToml("default", "./external-storage"),
				);
				await Deno.writeTextFile(
					join(tenantsDir, "beta.toml"),
					tenantToml("beta"),
				);
				await Deno.writeTextFile(
					join(tenantsDir, "alpha.toml"),
					tenantToml("alpha"),
				);
				await Deno.writeTextFile(join(tenantsDir, "ignored.txt"), "not toml");

				const config = await loadConfiguration(dir);

				expect(config.tenants.map(({ name }) => name)).toEqual([
					"default",
					"zeta",
					"alpha",
					"beta",
				]);
				expect(config.tenants[0].storage[1]).toBe(join(dir, "external-storage"));
				expect(config.adminTenantName).toBe("default");
				expect(await Deno.stat(join(tenantsDir, TENANT_SAMPLE_FILE))).toBeDefined();
			},
		);
	});

	it("uses a tenant named default as admin even when it is not first", async () => {
		await withConfigDir({ tenants: [tenant("company"), tenant("default")] }, async (dir) => {
			const config = await loadConfiguration(dir);
			expect(config.adminTenantName).toBe("default");
		});
	});

	it("uses the first inline tenant as admin when no tenant is named default", async () => {
		await withConfigDir({ tenants: [tenant("company-b"), tenant("company-a")] }, async (dir) => {
			const config = await loadConfiguration(dir);
			expect(config.adminTenantName).toBe("company-b");
		});
	});

	it("does not select an admin tenant when all tenants come from tenant files", async () => {
		await withConfigDir({}, async (dir) => {
			const tenantsDir = join(dir, "tenants.d");
			await Deno.mkdir(tenantsDir);
			await Deno.writeTextFile(
				join(tenantsDir, "company.toml"),
				tenantToml("company"),
			);

			const config = await loadConfiguration(dir);
			expect(config.adminTenantName).toBeNull();
		});
	});

	it("rejects tenant files whose names do not match their tenant", async () => {
		await withConfigDir({ tenants: [tenant("default")] }, async (dir) => {
			const tenantsDir = join(dir, "tenants.d");
			await Deno.mkdir(tenantsDir);
			await Deno.writeTextFile(
				join(tenantsDir, "wrong.toml"),
				tenantToml("company"),
			);

			await expect(loadConfiguration(dir)).rejects.toThrow("must match filename wrong");
		});
	});

	it("rejects malformed tenant TOML", async () => {
		await withConfigDir({ tenants: [tenant("default")] }, async (dir) => {
			const tenantsDir = join(dir, "tenants.d");
			await Deno.mkdir(tenantsDir);
			await Deno.writeTextFile(join(tenantsDir, "broken.toml"), "name = [");

			await expect(loadConfiguration(dir)).rejects.toThrow("invalid TOML");
		});
	});

	it("rejects an existing tenants.d path that is not a readable directory", async () => {
		await withConfigDir({ tenants: [tenant("default")] }, async (dir) => {
			await Deno.writeTextFile(join(dir, "tenants.d"), "not a directory");
			await expect(loadConfiguration(dir)).rejects.toThrow("is not a directory");
		});
	});

	it("rejects configurations without tenants", async () => {
		await withConfigDir({}, async (dir) => {
			await expect(loadConfiguration(dir)).rejects.toThrow("at least one tenant is required");
		});
	});
});
