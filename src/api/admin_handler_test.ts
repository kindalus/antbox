import { describe, it } from "bdd";
import { expect } from "expect";
import { SignJWT } from "jose";
import { join } from "node:path";
import { stringify } from "toml";

import type { AntboxTenant } from "./antbox_tenant.ts";
import { adminTenantsUpdateHandler } from "./admin_handler.ts";

const TEST_SYMMETRIC_KEY = "test-symmetric-key";

describe("adminTenantsUpdateHandler", () => {
	it("creates a tenant file and reloads the server", async () => {
		const configDir = await Deno.makeTempDir({ prefix: "admin-handler-test-" });
		try {
			await Deno.writeTextFile(
				join(configDir, "config.toml"),
				stringify({
					engine: "oak",
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

function tenantConfig(name: string) {
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
