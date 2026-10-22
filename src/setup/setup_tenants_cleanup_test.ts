import { expect } from "expect";
import { setupTenants } from "./setup_tenants.ts";
import type { ServerConfiguration, TenantConfiguration } from "api/http_server_configuration.ts";
import { loadPiCodingAgent } from "application/ai/pi_coding_agent.ts";

await loadPiCodingAgent();

async function fixture() {
	const directory = await Deno.makeTempDir();
	const modulePath = `${directory}/adapter.ts`;
	await Deno.writeTextFile(
		modulePath,
		`
import { right } from "shared/either.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryEventStoreRepository } from "adapters/inmem/inmem_event_store_repository.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
export const closed: string[] = [];
export default async function build(kind: string, id: string, failClose?: string) {
	if (kind === "fail") throw new Error("provider initialization failed");
	const provider = kind === "repository" ? new InMemoryNodeRepository()
		: kind === "storage" ? new InMemoryStorageProvider()
		: kind === "events" ? new InMemoryEventStoreRepository()
		: new InMemoryConfigurationRepository();
	return right(Object.assign(provider, { async close() {
		closed.push(id);
		if (failClose) throw new Error("provider close failed");
	} }));
}
`,
	);
	await Deno.writeTextFile(`${directory}/jwks.json`, JSON.stringify({ keys: [] }));
	const adapter = await import(modulePath) as { closed: string[] };
	const tenant = (name: string): TenantConfiguration => ({
		name,
		repository: [modulePath, "repository", `${name}:repository`],
		storage: [modulePath, "storage", `${name}:storage`, "fail-close"],
		eventStoreRepository: [modulePath, "events", `${name}:events`],
		configurationRepository: [modulePath, "configuration", `${name}:configuration`],
		limits: { storage: 10, tokens: 0 },
	});
	const configuration = (tenants: TenantConfiguration[]): ServerConfiguration => ({
		rootPasswd: "test-root",
		key: "dGVzdA==",
		jwks: `${directory}/jwks.json`,
		tenants,
	});
	return { directory, modulePath, adapter, tenant, configuration };
}

Deno.test("failed tenant setup closes new providers in reverse order and keeps the original error", async () => {
	const test = await fixture();
	try {
		await setupTenants(test.configuration([test.tenant("already-active")]));
		expect(test.adapter.closed).toEqual([]);
		await expect(setupTenants(test.configuration([
			test.tenant("first"),
			{ ...test.tenant("second"), eventStoreRepository: [test.modulePath, "fail"] },
		]))).rejects.toThrow("provider initialization failed");
		expect(test.adapter.closed).toEqual([
			"second:storage",
			"second:repository",
			"first:configuration",
			"first:events",
			"first:storage",
			"first:repository",
		]);
	} finally {
		await Deno.remove(test.directory, { recursive: true });
	}
});

Deno.test("invalid tenant key files reject setup and close earlier tenant providers", async () => {
	const test = await fixture();
	try {
		await expect(setupTenants(test.configuration([
			test.tenant("first"),
			{ ...test.tenant("second"), key: `${test.directory}/missing.key` },
		]))).rejects.toThrow();
		expect(test.adapter.closed).toEqual([
			"first:configuration",
			"first:events",
			"first:storage",
			"first:repository",
		]);
	} finally {
		await Deno.remove(test.directory, { recursive: true });
	}
});
