import { describe, it } from "bdd";
import { expect } from "expect";
import { stub } from "mock";
import { join } from "node:path";
import { parse, stringify } from "toml";
import type { TenantConfiguration } from "api/http_server_configuration.ts";
import { saveTenantConfiguration, withTenantConfigurationLock } from "./save_configuration.ts";

function tenant(name: string, storage = 1): TenantConfiguration {
	return {
		name,
		storage: ["inmem/inmem_storage_provider.ts"],
		repository: ["inmem/inmem_node_repository.ts"],
		configurationRepository: ["inmem/inmem_configuration_repository.ts"],
		eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
		limits: { storage, tokens: 0 },
	};
}

function tenantToml(config: TenantConfiguration): string {
	return stringify({ ...config });
}

async function withConfigDir(
	inlineTenants: TenantConfiguration[],
	run: (dir: string, tenantsDir: string) => Promise<void>,
): Promise<void> {
	const dir = await Deno.makeTempDir({ prefix: "antbox-save-config-test-" });
	const tenantsDir = join(dir, "tenants.d");
	try {
		await Deno.mkdir(tenantsDir);
		await Deno.writeTextFile(
			join(dir, "config.toml"),
			stringify({ engine: "oak", tenants: inlineTenants }),
		);
		await run(dir, tenantsDir);
	} finally {
		await Deno.remove(dir, { recursive: true });
	}
}

async function readTenant(path: string): Promise<TenantConfiguration> {
	return parse(await Deno.readTextFile(path)) as unknown as TenantConfiguration;
}

describe("saveTenantConfiguration", () => {
	it("waits for a failed save to roll back before reading the next update", async () => {
		await withConfigDir([tenant("default")], async (dir) => {
			const entered = Promise.withResolvers<void>();
			const failReload = Promise.withResolvers<void>();
			const first = saveTenantConfiguration(dir, [tenant("default", 2)], async () => {
				entered.resolve();
				await failReload.promise;
				throw new Error("first reload failed");
			}).catch((error) => error);
			await entered.promise;

			const readTextFile = Deno.readTextFile;
			const reads = stub(Deno, "readTextFile", (...args) => readTextFile(...args));
			const second = saveTenantConfiguration(`${dir}/.`, [tenant("default", 3)]);
			try {
				await Promise.resolve();
				expect(reads.calls.length).toBe(0);
			} finally {
				failReload.resolve();
				await Promise.allSettled([first, second]);
				reads.restore();
			}
			expect((await first).message).toBe("first reload failed");
			await second;
			const stored = parse(await Deno.readTextFile(join(dir, "config.toml"))) as {
				tenants: TenantConfiguration[];
			};
			expect(stored.tenants[0].limits.storage).toBe(3);
		});
	});

	it("does not block operations for a different configuration directory", async () => {
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const first = withTenantConfigurationLock("/first-config", async () => {
			entered.resolve();
			await release.promise;
		});
		await entered.promise;
		try {
			expect(await withTenantConfigurationLock("/second-config", () => Promise.resolve("done")))
				.toBe("done");
		} finally {
			release.resolve();
			await first;
		}
	});

	it("updates each tenant at its source, creates new files, and removes all deleted definitions", async () => {
		await withConfigDir(
			[
				tenant("default"),
				tenant("inline"),
				tenant("shadowed"),
				tenant("removed-both"),
			],
			async (dir, tenantsDir) => {
				await Deno.writeTextFile(
					join(tenantsDir, "shadowed.toml"),
					tenantToml(tenant("shadowed", 2)),
				);
				await Deno.writeTextFile(
					join(tenantsDir, "external.toml"),
					tenantToml(tenant("external")),
				);
				await Deno.writeTextFile(
					join(tenantsDir, "removed-both.toml"),
					tenantToml(tenant("removed-both", 2)),
				);
				let reloads = 0;

				await saveTenantConfiguration(
					dir,
					[
						tenant("default", 9),
						tenant("inline", 8),
						tenant("shadowed", 7),
						tenant("external", 6),
						tenant("new-tenant", 5),
					],
					() => {
						reloads++;
						return Promise.resolve();
					},
				);

				const rawConfig = parse(await Deno.readTextFile(join(dir, "config.toml"))) as {
					tenants: TenantConfiguration[];
				};
				expect(rawConfig.tenants.map(({ name }) => name)).toEqual([
					"default",
					"inline",
					"shadowed",
				]);
				expect(rawConfig.tenants[0].limits.storage).toBe(9);
				expect(rawConfig.tenants[1].limits.storage).toBe(8);
				expect(rawConfig.tenants[2].limits.storage).toBe(1);
				expect((await readTenant(join(tenantsDir, "shadowed.toml"))).limits.storage)
					.toBe(7);
				expect((await readTenant(join(tenantsDir, "external.toml"))).limits.storage)
					.toBe(6);
				expect((await readTenant(join(tenantsDir, "new-tenant.toml"))).limits.storage)
					.toBe(5);
				await expect(Deno.stat(join(tenantsDir, "removed-both.toml"))).rejects.toThrow();
				expect(reloads).toBe(1);
			},
		);
	});

	it("restores every affected file when reload fails", async () => {
		await withConfigDir([tenant("default")], async (dir, tenantsDir) => {
			const configPath = join(dir, "config.toml");
			const externalPath = join(tenantsDir, "external.toml");
			const deletedPath = join(tenantsDir, "private.toml");
			const privateConfig = tenantToml({
				...tenant("private"),
				rootPasswd: "test-only-password",
			});
			await Deno.writeTextFile(deletedPath, privateConfig, { mode: 0o600 });
			await Deno.writeTextFile(
				externalPath,
				`# keep this comment\n${tenantToml(tenant("external"))}`,
			);
			const originalConfig = await Deno.readTextFile(configPath);
			const originalExternal = await Deno.readTextFile(externalPath);

			await expect(saveTenantConfiguration(
				dir,
				[tenant("default", 2), tenant("external", 2), tenant("new-tenant")],
				() => Promise.reject(new Error("reload failed")),
			)).rejects.toThrow("reload failed");

			expect(await Deno.readTextFile(configPath)).toBe(originalConfig);
			expect(await Deno.readTextFile(externalPath)).toBe(originalExternal);
			expect(await Deno.readTextFile(deletedPath)).toBe(privateConfig);
			if (Deno.build.os !== "windows") {
				expect((await Deno.stat(deletedPath)).mode! & 0o777).toBe(0o600);
			}
			await expect(Deno.stat(join(tenantsDir, "new-tenant.toml"))).rejects.toThrow();
		});
	});
});
