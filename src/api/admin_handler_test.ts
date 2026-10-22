import { describe, it } from "bdd";
import { expect } from "expect";
import { SignJWT } from "jose";
import { join } from "node:path";
import { parse, stringify } from "toml";

import type { AntboxTenant } from "./antbox_tenant.ts";
import type { TenantConfiguration } from "./http_server_configuration.ts";
import { adminReloadHandler, adminTenantsUpdateHandler } from "./admin_handler.ts";
import { saveTenantConfiguration } from "setup/save_configuration.ts";

const TEST_SYMMETRIC_KEY = "test-symmetric-key";

Deno.test("manual admin reload waits until a failed tenant update has rolled back", async () => {
	const configDir = await Deno.makeTempDir({ prefix: "admin-reload-test-" });
	const failReload = Promise.withResolvers<void>();
	let first: Promise<unknown> | undefined;
	let response: Promise<Response> | undefined;
	try {
		const original = tenantConfig("default");
		const configPath = join(configDir, "config.toml");
		await Deno.writeTextFile(configPath, stringify({ engine: "oak", tenants: [original] }));
		const enteredReload = Promise.withResolvers<void>();
		first = saveTenantConfiguration(configDir, [{
			...original,
			limits: { storage: 20, tokens: 0 },
		}], async () => {
			enteredReload.resolve();
			await failReload.promise;
			throw new Error("tenant update reload failed");
		}).catch((error) => error);
		await enteredReload.promise;

		const authorized = Promise.withResolvers<void>();
		const admin = createAdminTenant();
		Object.defineProperty(admin, "isAdminTenant", {
			get() {
				authorized.resolve();
				return true;
			},
		});
		let reloaded = false;
		let observedStorage: unknown;
		const handler = adminReloadHandler([admin], async () => {
			reloaded = true;
			const config = parse(await Deno.readTextFile(configPath)) as {
				tenants: Array<{ limits: { storage: unknown } }>;
			};
			observedStorage = config.tenants[0].limits.storage;
		}, configDir);
		const authenticated = await createAdminRequest("{}");
		response = handler(
			new Request("http://localhost/v2/admin/reload", {
				method: "POST",
				headers: authenticated.headers,
			}),
		);
		await authorized.promise;
		expect(reloaded).toBe(false);
		failReload.resolve();
		expect((await response).status).toBe(200);
		expect(observedStorage).toBe(original.limits.storage);
	} finally {
		failReload.resolve();
		await Promise.allSettled([first, response]);
		await Deno.remove(configDir, { recursive: true });
	}
});

describe("adminTenantsUpdateHandler", () => {
	it("creates a tenant file and reloads the server", async () => {
		const configDir = await Deno.makeTempDir({ prefix: "admin-handler-test-" });
		try {
			await Deno.writeTextFile(
				join(configDir, "config.toml"),
				stringify({
					engine: "oak",
					rootPasswd: "test-root",
					key: "antbox.key",
					jwks: "antbox.jwks",
					tenants: [tenantConfig("default")],
				}),
			);
			let reloaded = false;
			const handler = adminTenantsUpdateHandler(
				[createAdminTenant()],
				() => {
					reloaded = true;
					return Promise.resolve();
				},
				configDir,
			);

			const response = await handler(
				await createAdminRequest(JSON.stringify([
					tenantConfig("default"),
					tenantConfig("company"),
				])),
			);

			expect(response.status).toBe(200);
			expect(reloaded).toBe(true);
			expect(await Deno.readTextFile(join(configDir, "tenants.d", "company.toml")))
				.toContain('name = "company"');
		} finally {
			await Deno.remove(configDir, { recursive: true });
		}
	});

	it("rejects removing a tenant's only root password before saving", async () => {
		const configDir = await Deno.makeTempDir({ prefix: "admin-password-test-" });
		try {
			const configPath = join(configDir, "config.toml");
			const original = stringify({
				tenants: [{ ...tenantConfig("default"), rootPasswd: "tenant-root" }],
			});
			await Deno.writeTextFile(configPath, original);
			let reloaded = false;
			const handler = adminTenantsUpdateHandler([createAdminTenant()], async () => {
				reloaded = true;
			}, configDir);
			const response = await handler(
				await createAdminRequest(JSON.stringify([tenantConfig("default")])),
			);
			expect(response.status).toBe(400);
			expect((await response.json()).error).toContain("rootPasswd");
			expect(reloaded).toBe(false);
			expect(await Deno.readTextFile(configPath)).toBe(original);
		} finally {
			await Deno.remove(configDir, { recursive: true });
		}
	});

	it("returns 404 when the selected tenant is not administrative", async () => {
		const handler = adminTenantsUpdateHandler(
			[createAdminTenant(false)],
			() => Promise.resolve(),
		);

		const response = await handler(await createAdminRequest("{}"));

		expect(response.status).toBe(404);
	});

	it("returns 400 for invalid JSON bodies", async () => {
		let reloaded = false;
		const handler = adminTenantsUpdateHandler(
			[createAdminTenant()],
			async () => {
				reloaded = true;
			},
		);

		const response = await handler(await createAdminRequest("{"));

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" });
		expect(reloaded).toBe(false);
	});

	it("returns 400 when tenant key is an empty string", async () => {
		let reloaded = false;
		const handler = adminTenantsUpdateHandler(
			[createAdminTenant()],
			async () => {
				reloaded = true;
			},
		);

		const response = await handler(
			await createAdminRequest(JSON.stringify([{
				name: "default",
				key: "",
				storage: ["inmem/inmem_storage_provider.ts"],
				repository: ["inmem/inmem_node_repository.ts"],
				configurationRepository: ["inmem/inmem_configuration_repository.ts"],
				eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
				limits: {
					storage: 10,
					tokens: 0,
				},
			}])),
		);

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.errors).toBeDefined();
		expect(reloaded).toBe(false);
	});

	it("returns 400 when tenant jwks is an empty string", async () => {
		let reloaded = false;
		const handler = adminTenantsUpdateHandler(
			[createAdminTenant()],
			async () => {
				reloaded = true;
			},
		);

		const response = await handler(
			await createAdminRequest(JSON.stringify([{
				name: "default",
				jwks: "",
				storage: ["inmem/inmem_storage_provider.ts"],
				repository: ["inmem/inmem_node_repository.ts"],
				configurationRepository: ["inmem/inmem_configuration_repository.ts"],
				eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
				limits: {
					storage: 10,
					tokens: 0,
				},
			}])),
		);

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.errors).toBeDefined();
		expect(reloaded).toBe(false);
	});
});

function tenantConfig(name: string): TenantConfiguration {
	return {
		name,
		storage: ["inmem/inmem_storage_provider.ts"],
		repository: ["inmem/inmem_node_repository.ts"],
		configurationRepository: ["inmem/inmem_configuration_repository.ts"],
		eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
		limits: { storage: 10, tokens: 0 },
	};
}

function createAdminTenant(isAdminTenant = true): AntboxTenant {
	return {
		name: "default",
		isAdminTenant,
		rootPasswd: "demo",
		symmetricKey: TEST_SYMMETRIC_KEY,
		apiKeysService: {},
		externalLoginService: {},
	} as unknown as AntboxTenant;
}

async function createAdminRequest(body: BodyInit): Promise<Request> {
	const token = await new SignJWT({})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setIssuer("urn:antbox")
		.setAudience("default")
		.setExpirationTime("1h")
		.sign(new TextEncoder().encode(TEST_SYMMETRIC_KEY));

	return new Request("http://localhost/v2/admin/tenants", {
		method: "PUT",
		body,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			"X-Tenant": "default",
		},
	});
}
