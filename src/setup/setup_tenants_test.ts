import { describe, it } from "bdd";
import { expect } from "expect";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import fs from "node:fs/promises";
import process from "node:process";
import { tempPath } from "shared/temp_path.ts";

import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { ServerConfiguration, TenantConfiguration } from "api/http_server_configuration.ts";
import { stringify } from "smol-toml";
import { loadConfiguration } from "./load_configuration.ts";
import { setupTenants } from "./setup_tenants.ts";
import { loadPiCodingAgent } from "application/ai/pi_coding_agent.ts";

await loadPiCodingAgent();

describe("setupTenants", () => {
	function createAdminContext(tenant: string): AuthenticationContext {
		return {
			tenant,
			mode: "Action",
			principal: {
				email: "admin@example.com",
				groups: [ADMINS_GROUP_UUID],
			},
		};
	}

	async function createJwksFile() {
		const { publicKey, privateKey } = await generateKeyPair("RS256");
		const jwksPath = tempPath(tmpdir(), "antbox-") + ".jwks.json";
		await fs.writeFile(
			jwksPath,
			JSON.stringify({
				keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid: "test-key" }],
			}),
		);

		return { jwksPath, privateKey };
	}

	async function createStorageProviderModule() {
		const adaptersDir = `${process.cwd()}/src/adapters`;
		const modulePath = tempPath(adaptersDir, ".tmp-storage-provider-") + ".ts";
		const relativeModulePath = `./${basename(modulePath)}`;

		await fs.writeFile(
			modulePath,
			[
				'import { right } from "../shared/either.ts";',
				"",
				"let listenerRegistered = false;",
				"",
				"export function wasListenerRegistered() {",
				"\treturn listenerRegistered;",
				"}",
				"",
				"export default function buildStorageProvider() {",
				"\treturn Promise.resolve(right({",
				"\t\tdelete: async () => right(undefined),",
				"\t\tmkdir: async () => right(undefined),",
				"\t\trmdir: async () => right(undefined),",
				"\t\twrite: async () => right(undefined),",
				'\t\tread: async () => right(new File([], "test.txt")),',
				"\t\tstartListeners: (subscribe) => {",
				'\t\t\tlistenerRegistered = typeof subscribe === "function";',
				"\t\t},",
				"\t\tprovideCDN: () => false,",
				"\t\tgetCDNUrl: () => undefined,",
				"\t}));",
				"}",
			].join("\n"),
		);

		return { modulePath, relativeModulePath };
	}

	async function signExternalToken(
		privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"],
		email: string,
	): Promise<string> {
		return new SignJWT({ email })
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuedAt()
			.setIssuer("external-idp")
			.setExpirationTime("1h")
			.sign(privateKey);
	}

	function createTenantConfig(name: string): TenantConfiguration {
		return {
			name,
			storage: ["inmem/inmem_storage_provider.ts"],
			database: ["inmem"],
			limits: {
				storage: 10,
				tokens: 0,
			},
		};
	}

	it("sets up multiple tenants that share adapter modules", async () => {
		const { jwksPath } = await createJwksFile();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [
					createTenantConfig("tenant-a"),
					createTenantConfig("tenant-b"),
				],
			};

			const tenants = await setupTenants(config);
			expect(tenants.map(({ name }) => name)).toEqual(["tenant-a", "tenant-b"]);
		} finally {
			await fs.unlink(jwksPath);
		}
	});

	it("requires an explicit nonempty root password globally or for each tenant", async () => {
		const { jwksPath } = await createJwksFile();
		try {
			for (const rootPasswd of [undefined, "", "   "]) {
				await expect(setupTenants({
					rootPasswd,
					key: "c2VydmVyLXNlY3JldA==",
					jwks: jwksPath,
					tenants: [createTenantConfig("tenant-a")],
				})).rejects.toThrow("rootPasswd");
			}
			await expect(setupTenants({
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [{
					...createTenantConfig("tenant-a"),
					rootPasswd: "",
				}],
			})).rejects.toThrow("rootPasswd");
		} finally {
			await fs.unlink(jwksPath);
		}
	});

	it("inherits global rootPasswd, key, and jwks when tenant values are absent", async () => {
		const { jwksPath, privateKey } = await createJwksFile();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [createTenantConfig("tenant-a")],
			};

			const [tenant] = await setupTenants(config);
			expect(tenant.isAdminTenant).toBe(true);
			expect(tenant.rootPasswd).toBe("global-root");
			expect(tenant.symmetricKey).toBe("c2VydmVyLXNlY3JldA==");
			expect(tenant.limits).toEqual({ storage: 10, tokens: 0 });

			await tenant.usersService.createUser(createAdminContext(tenant.name), {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers", "staff"],
				hasWhatsapp: false,
				active: true,
			});

			const token = await signExternalToken(privateKey, "john.doe@example.com");
			const principalOrErr = await tenant.externalLoginService.resolvePrincipal(token);

			expect(principalOrErr.isRight()).toBe(true);
			if (principalOrErr.isRight()) {
				expect(principalOrErr.value.email).toBe("john.doe@example.com");
			}
		} finally {
			await fs.unlink(jwksPath);
		}
	});

	it("registers storage provider listeners during tenant setup", async () => {
		const { jwksPath } = await createJwksFile();
		const { modulePath: storageModulePath, relativeModulePath: storageModule } =
			await createStorageProviderModule();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [{
					...createTenantConfig("tenant-storage-listeners"),
					storage: [storageModule],
				}],
			};

			await setupTenants(config);

			const storageModuleExports = await import(`file://${storageModulePath}`);
			expect(storageModuleExports.wasListenerRegistered()).toBe(true);
		} finally {
			await fs.unlink(storageModulePath);
			await fs.unlink(jwksPath);
		}
	});

	it("rejects non-zero token limits when AI is disabled", async () => {
		const { jwksPath } = await createJwksFile();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [{
					...createTenantConfig("tenant-invalid-ai-disabled"),
					limits: {
						storage: 10,
						tokens: 1,
					},
				}],
			};

			await expect(setupTenants(config)).rejects.toThrow(
				"Tenant tenant-invalid-ai-disabled: tokens limit must be 0 when AI is disabled",
			);
		} finally {
			await fs.unlink(jwksPath);
		}
	});

	it("rejects zero token limits when AI is enabled", async () => {
		const { jwksPath } = await createJwksFile();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [{
					...createTenantConfig("tenant-invalid-ai-enabled"),
					ai: {
						enabled: true,
						defaultModel: ["google/gemini-2.5-flash"],
					},
					limits: {
						storage: 10,
						tokens: 0,
					},
				}],
			};

			await expect(setupTenants(config)).rejects.toThrow(
				"Tenant tenant-invalid-ai-enabled: tokens limit must be greater than 0 when AI is enabled",
			);
		} finally {
			await fs.unlink(jwksPath);
		}
	});

	it("prefers tenant auth values over global ones", async () => {
		const globalJwks = await createJwksFile();
		const tenantJwks = await createJwksFile();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "Z2xvYmFsLXNlY3JldA==",
				jwks: globalJwks.jwksPath,
				tenants: [{
					...createTenantConfig("tenant-b"),
					rootPasswd: "tenant-root",
					key: "dGVuYW50LXNlY3JldA==",
					jwks: tenantJwks.jwksPath,
				}],
			};

			const [tenant] = await setupTenants(config);
			expect(tenant.rootPasswd).toBe("tenant-root");
			expect(tenant.symmetricKey).toBe("dGVuYW50LXNlY3JldA==");

			await tenant.usersService.createUser(createAdminContext(tenant.name), {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers", "staff"],
				hasWhatsapp: false,
				active: true,
			});

			const tenantToken = await signExternalToken(tenantJwks.privateKey, "john.doe@example.com");
			const tenantPrincipalOrErr = await tenant.externalLoginService.resolvePrincipal(
				tenantToken,
			);
			expect(tenantPrincipalOrErr.isRight()).toBe(true);

			const globalToken = await signExternalToken(globalJwks.privateKey, "john.doe@example.com");
			const globalPrincipalOrErr = await tenant.externalLoginService.resolvePrincipal(
				globalToken,
			);
			expect(globalPrincipalOrErr.isLeft()).toBe(true);
		} finally {
			await fs.unlink(globalJwks.jwksPath);
			await fs.unlink(tenantJwks.jwksPath);
		}
	});

	it("boots a sqlite tenant from config.toml with all three databases in one folder", async () => {
		const dir = await fs.mkdtemp(join(tmpdir(), "antbox-sqlite-e2e-"));
		try {
			const configDir = join(dir, "config");
			const dataDir = join(dir, "data");
			await fs.mkdir(configDir);
			await fs.writeFile(
				join(configDir, "config.toml"),
				stringify({
					rootPasswd: "root",
					tenants: [{
						name: "default",
						storage: ["inmem/inmem_storage_provider.ts"],
						database: ["sqlite", "db"],
						limits: { storage: 10, tokens: 0 },
					}],
				}),
			);

			const config = await loadConfiguration(configDir, dataDir);
			expect(config.tenants[0].database).toEqual(["sqlite", join(dataDir, "db")]);
			await setupTenants(config);

			expect((await fs.readdir(join(dataDir, "db"))).filter((f) => f.endsWith(".db")).sort())
				.toEqual(["config.db", "events.db", "nodes.db"]);
		} finally {
			await fs.rm(dir, { recursive: true });
		}
	});

	it("refuses to start on a legacy sqlite layout without touching it", async () => {
		const { jwksPath } = await createJwksFile();
		const folder = await fs.mkdtemp(join(tmpdir(), "antbox-legacy-"));
		try {
			await fs.mkdir(join(folder, "repository"));
			await fs.writeFile(join(folder, "repository", "nodes.db"), "x");

			await expect(setupTenants({
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [{ ...createTenantConfig("legacy"), database: ["sqlite", folder] }],
			})).rejects.toThrow(`mv ${folder}/repository/nodes.db* ${folder}/`);
			expect((await fs.readdir(folder, { recursive: true })).sort())
				.toEqual(["repository", "repository/nodes.db"]);
		} finally {
			await fs.rm(folder, { recursive: true });
			await fs.unlink(jwksPath);
		}
	});
});
