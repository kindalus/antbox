import { describe, it } from "bdd";
import { expect } from "expect";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { basename } from "path";

import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { ServerConfiguration, TenantConfiguration } from "api/http_server_configuration.ts";
import { setupTenants } from "./setup_tenants.ts";

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
		const jwksPath = await Deno.makeTempFile({ suffix: ".jwks.json" });
		await Deno.writeTextFile(
			jwksPath,
			JSON.stringify({
				keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid: "test-key" }],
			}),
		);

		return { jwksPath, privateKey };
	}

	async function createConfigRepositoryModule() {
		const adaptersDir = `${Deno.cwd()}/src/adapters`;
		const modulePath = await Deno.makeTempFile({
			dir: adaptersDir,
			prefix: ".tmp-setup-tenants-",
			suffix: ".ts",
		});
		const relativeModulePath = `./${basename(modulePath)}`;

		await Deno.writeTextFile(
			modulePath,
			[
				'import { InMemoryConfigurationRepository } from "./inmem/inmem_configuration_repository.ts";',
				'import { right } from "../shared/either.ts";',
				"",
				"export default function buildInMemoryConfigurationRepository() {",
				"\treturn Promise.resolve(right(new InMemoryConfigurationRepository()));",
				"}",
			].join("\n"),
		);

		return { modulePath, relativeModulePath };
	}

	async function createStorageProviderModule() {
		const adaptersDir = `${Deno.cwd()}/src/adapters`;
		const modulePath = await Deno.makeTempFile({
			dir: adaptersDir,
			prefix: ".tmp-storage-provider-",
			suffix: ".ts",
		});
		const relativeModulePath = `./${basename(modulePath)}`;

		await Deno.writeTextFile(
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

	function createTenantConfig(name: string, configurationRepository: string): TenantConfiguration {
		return {
			name,
			storage: ["inmem/inmem_storage_provider.ts"],
			repository: ["inmem/inmem_node_repository.ts"],
			configurationRepository: [configurationRepository],
			eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
			limits: {
				storage: 10,
				tokens: 0,
			},
		};
	}

	it("inherits global rootPasswd, key, and jwks when tenant values are absent", async () => {
		const { jwksPath, privateKey } = await createJwksFile();
		const { modulePath, relativeModulePath } = await createConfigRepositoryModule();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [createTenantConfig("tenant-a", relativeModulePath)],
			};

			const [tenant] = await setupTenants(config);
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
			await Deno.remove(modulePath);
			await Deno.remove(jwksPath);
		}
	});

	it("registers storage provider listeners during tenant setup", async () => {
		const { jwksPath } = await createJwksFile();
		const { modulePath: configModulePath, relativeModulePath: configModule } =
			await createConfigRepositoryModule();
		const { modulePath: storageModulePath, relativeModulePath: storageModule } =
			await createStorageProviderModule();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [{
					...createTenantConfig("tenant-storage-listeners", configModule),
					storage: [storageModule],
				}],
			};

			await setupTenants(config);

			const storageModuleExports = await import(`file://${storageModulePath}`);
			expect(storageModuleExports.wasListenerRegistered()).toBe(true);
		} finally {
			await Deno.remove(configModulePath);
			await Deno.remove(storageModulePath);
			await Deno.remove(jwksPath);
		}
	});

	it("rejects non-zero token limits when AI is disabled", async () => {
		const { jwksPath } = await createJwksFile();
		const { modulePath, relativeModulePath } = await createConfigRepositoryModule();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [{
					...createTenantConfig("tenant-invalid-ai-disabled", relativeModulePath),
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
			await Deno.remove(modulePath);
			await Deno.remove(jwksPath);
		}
	});

	it("rejects zero token limits when AI is enabled", async () => {
		const { jwksPath } = await createJwksFile();
		const { modulePath, relativeModulePath } = await createConfigRepositoryModule();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [{
					...createTenantConfig("tenant-invalid-ai-enabled", relativeModulePath),
					ai: {
						enabled: true,
						defaultModel: "google/gemini-2.5-flash",
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
			await Deno.remove(modulePath);
			await Deno.remove(jwksPath);
		}
	});

	it("prefers tenant auth values over global ones", async () => {
		const globalJwks = await createJwksFile();
		const tenantJwks = await createJwksFile();
		const { modulePath, relativeModulePath } = await createConfigRepositoryModule();

		try {
			const config: ServerConfiguration = {
				rootPasswd: "global-root",
				key: "Z2xvYmFsLXNlY3JldA==",
				jwks: globalJwks.jwksPath,
				tenants: [{
					...createTenantConfig("tenant-b", relativeModulePath),
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
			await Deno.remove(modulePath);
			await Deno.remove(globalJwks.jwksPath);
			await Deno.remove(tenantJwks.jwksPath);
		}
	});

	it("rejects tenants that omit required repository configuration at runtime", async () => {
		const { jwksPath } = await createJwksFile();
		const { modulePath, relativeModulePath } = await createConfigRepositoryModule();

		try {
			const config = {
				rootPasswd: "global-root",
				key: "c2VydmVyLXNlY3JldA==",
				jwks: jwksPath,
				tenants: [{
					name: "broken-tenant",
					storage: ["inmem/inmem_storage_provider.ts"],
					configurationRepository: [relativeModulePath],
					eventStoreRepository: ["inmem/inmem_event_store_repository.ts"],
					limits: {
						storage: 10,
						tokens: 0,
					},
				} as unknown as TenantConfiguration],
			} as ServerConfiguration;

			await expect(setupTenants(config)).rejects.toThrow(
				"Tenant broken-tenant: repository is required but not configured",
			);
		} finally {
			await Deno.remove(modulePath);
			await Deno.remove(jwksPath);
		}
	});
});
