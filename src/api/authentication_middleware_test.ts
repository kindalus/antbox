import { describe, it } from "bdd";
import { expect } from "expect";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { ApiKeysService } from "application/security/api_keys_service.ts";
import { ExternalLoginService } from "application/security/external_login_service.ts";
import { UsersService } from "application/security/users_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import { ANONYMOUS_USER_EMAIL, ROOT_USER_EMAIL } from "domain/configuration/builtin_users.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { authenticationMiddleware } from "./authentication_middleware.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getTenant } from "./get_tenant.ts";
import { rootHandler } from "./login_handler.ts";

describe("authenticationMiddleware", () => {
	const adminCtx: AuthenticationContext = {
		tenant: "default",
		principal: {
			email: "admin@example.com",
			groups: [ADMINS_GROUP_UUID],
		},
		mode: "Action",
	};

	it("returns 400 when the requested tenant does not exist", async () => {
		const tenant = {
			name: "default",
			rootPasswd: "demo",
			symmetricKey: "test-symmetric-key",
		} as unknown as AntboxTenant;

		const handler = authenticationMiddleware([tenant])(async () => {
			return new Response("ok");
		});

		const response = await handler(
			new Request("http://localhost/v2/nodes", {
				headers: { "X-Tenant": "missing-tenant" },
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ message: "Tenant not found" });
	});

	it("overrides jwt groups with local user groups for external tokens", async () => {
		const repo = new InMemoryConfigurationRepository();
		const usersService = new UsersService(repo);
		await usersService.createUser(adminCtx, {
			email: "john.doe@example.com",
			title: "John Doe",
			group: "developers",
			groups: ["developers", "staff"],
			hasWhatsapp: false,
			active: true,
		});

		const { publicKey, privateKey } = await generateKeyPair("RS256");
		const rawJwks = {
			keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid: "test-key" }],
		};
		const externalLoginService = new ExternalLoginService(
			usersService,
			{ type: "local", jwks: rawJwks },
		);
		const apiKeysService = new ApiKeysService(repo);

		const tenant = {
			name: "default",
			rootPasswd: "demo",
			symmetricKey: "test-symmetric-key",
			externalLoginService,
			apiKeysService,
			usersService,
		} as unknown as AntboxTenant;

		const token = await new SignJWT({
			email: "john.doe@example.com",
			groups: ["admins"],
		})
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuedAt()
			.setIssuer("external-idp")
			.setExpirationTime("1h")
			.sign(privateKey);

		const handler = authenticationMiddleware([tenant])(async (req: Request) => {
			return new Response(req.headers.get("X-Principal"), {
				headers: { "Content-Type": "application/json" },
			});
		});

		const response = await handler(
			new Request("http://localhost/v2/login/me", {
				headers: {
					Authorization: `Bearer ${token}`,
					"X-Tenant": "default",
				},
			}),
		);

		const principal = await response.json();
		expect(principal.email).toBe("john.doe@example.com");
		expect(principal.groups).toEqual(expect.arrayContaining(["developers", "staff"]));

		await usersService.updateUser(adminCtx, principal.email, { active: false });
		const disabledResponse = await handler(
			new Request("http://localhost/v2/login/me", {
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		expect((await disabledResponse.json()).email).toBe(ANONYMOUS_USER_EMAIL);
	});

	function tenant(name = "first"): AntboxTenant {
		const repo = new InMemoryConfigurationRepository();
		return {
			name,
			rootPasswd: "test-password",
			symmetricKey: "shared-test-symmetric-key",
			apiKeysService: new ApiKeysService(repo),
			externalLoginService: new ExternalLoginService(new UsersService(repo), {
				type: "local",
				jwks: { keys: [] },
			}),
		} as unknown as AntboxTenant;
	}

	function contextHandler(tenants: AntboxTenant[]) {
		return authenticationMiddleware(tenants)(async (req) =>
			Response.json(getAuthenticationContext(req))
		);
	}

	it("keeps the authenticated tenant when reload replaces or removes its services", async () => {
		for (const replace of [false, true]) {
			const selected = tenant("selected");
			const tenants = [selected, tenant("other")];
			const key = await selected.apiKeysService.createApiKey(adminCtx, {
				title: "Reload test key",
				group: "editors",
				active: true,
			});
			if (key.isLeft()) throw key.value;
			const lookup = selected.apiKeysService.getApiKeyBySecret.bind(selected.apiKeysService);
			selected.apiKeysService.getApiKeyBySecret = (secret) => {
				tenants.splice(0, tenants.length, tenant(replace ? "selected" : "other"));
				return lookup(secret);
			};
			const handler = authenticationMiddleware(tenants)(async (req) =>
				Response.json({
					sameTenant: getTenant(req, tenants) === selected,
					contextTenant: getAuthenticationContext(req).tenant,
				})
			);
			const response = await handler(
				new Request("http://localhost/v2/nodes", {
					headers: { "X-Tenant": "selected", Authorization: `ApiKey ${key.value.secret}` },
				}),
			);
			expect(await response.json()).toEqual({ sameTenant: true, contextTenant: "selected" });
		}
	});

	it("resolves the default query alias once per request during reload", async () => {
		const selected = tenant("first");
		const other = tenant("second");
		const tenants = [selected, other];
		const handler = authenticationMiddleware(tenants)(async (req) => {
			tenants.reverse();
			return Response.json({
				sameTenant: getTenant(req, tenants) === selected,
				contextTenant: getAuthenticationContext(req).tenant,
			});
		});
		const response = await handler(new Request("http://localhost/v2/nodes?x-tenant=default"));
		expect(await response.json()).toEqual({ sameTenant: true, contextTenant: "first" });
	});

	it("binds API key principals to the resolved key and ignores forged credential identifiers", async () => {
		const target = tenant();
		const created = await target.apiKeysService.createApiKey(adminCtx, {
			title: "Session test key",
			group: "editors",
			active: true,
		});
		if (created.isLeft()) throw created.value;
		const response = await contextHandler([target])(
			new Request("http://localhost", {
				headers: {
					authorization: `ApiKey ${created.value.secret}`,
					"X-Principal": JSON.stringify({ apiKeyUuid: "another-key", email: ROOT_USER_EMAIL }),
				},
			}),
		);
		expect((await response.json()).principal).toEqual({
			email: "apikey@antbox.io",
			groups: ["editors"],
			apiKeyUuid: created.value.uuid,
		});
		const invalid = await contextHandler([target])(
			new Request("http://localhost", { headers: { authorization: "ApiKey invalid" } }),
		);
		expect((await invalid.json()).principal.apiKeyUuid).toBeUndefined();
	});

	it("treats malformed JWTs as anonymous and replaces a forged principal", async () => {
		const handler = contextHandler([tenant()]);
		for (const authorization of ["Bearer not-a-jwt", "bEaReR invalid.token.parts"]) {
			const response = await handler(
				new Request("http://localhost", {
					headers: {
						authorization,
						"X-Principal": JSON.stringify({
							email: ROOT_USER_EMAIL,
							groups: [ADMINS_GROUP_UUID],
						}),
					},
				}),
			);
			expect((await response.json()).principal.email).toBe(ANONYMOUS_USER_EMAIL);
		}
	});

	it("uses the resolved tenant name in the authentication context", async () => {
		const handler = contextHandler([tenant("first"), tenant("second")]);
		for (
			const [url, headers, expected] of [
				["http://localhost", {}, "first"],
				["http://localhost", { "X-Tenant": "default" }, "first"],
				["http://localhost?x-tenant=second", { "X-Tenant": "first" }, "second"],
			] as const
		) {
			const response = await handler(new Request(url, { headers }));
			expect((await response.json()).tenant).toBe(expected);
		}
	});

	it("binds root login sessions to their tenant even when signing keys are shared", async () => {
		const tenants = [tenant("first"), tenant("second")];
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode("test-password"),
		);
		const body = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
			.join("");
		const login = await rootHandler(tenants)(
			new Request("http://localhost/v2/login/root", {
				method: "POST",
				body,
			}),
		);
		expect(login.status).toBe(200);
		const { jwt } = await login.json();
		const handler = contextHandler(tenants);

		for (
			const [selected, expected] of [["first", ROOT_USER_EMAIL], [
				"second",
				ANONYMOUS_USER_EMAIL,
			]]
		) {
			const response = await handler(
				new Request(`http://localhost?x-tenant=${selected}`, {
					headers: { authorization: `Bearer ${jwt}` },
				}),
			);
			expect((await response.json()).principal.email).toBe(expected);
		}
	});

	it("rejects root tokens without an expiry or tenant audience", async () => {
		const selectedTenant = tenant();
		const handler = contextHandler([selectedTenant]);
		for (const claims of [{ exp: Math.floor(Date.now() / 1000) + 3600 }, { aud: "first" }]) {
			const token = await new SignJWT(claims)
				.setProtectedHeader({ alg: "HS256" })
				.setIssuer("urn:antbox")
				.sign(new TextEncoder().encode(selectedTenant.symmetricKey));
			const response = await handler(
				new Request("http://localhost", {
					headers: { authorization: `Bearer ${token}` },
				}),
			);
			expect((await response.json()).principal.email).toBe(ANONYMOUS_USER_EMAIL);
		}
	});

	it("uses cookies only for the same origin while accepting explicit cross-origin credentials", async () => {
		const selectedTenant = tenant();
		const jwt = await new SignJWT({})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer("urn:antbox")
			.setAudience(selectedTenant.name)
			.setExpirationTime("1h")
			.sign(new TextEncoder().encode(selectedTenant.symmetricKey));
		const handler = contextHandler([selectedTenant]);
		for (
			const [origin, expected] of [
				[undefined, ROOT_USER_EMAIL],
				["https://api.example.com", ROOT_USER_EMAIL],
				["https://untrusted.example.com", ANONYMOUS_USER_EMAIL],
				["null", ANONYMOUS_USER_EMAIL],
			] as const
		) {
			const headers = new Headers({ cookie: `token=${jwt}` });
			if (origin) headers.set("origin", origin);
			const response = await handler(new Request("https://api.example.com", { headers }));
			expect((await response.json()).principal.email).toBe(expected);
		}
		const bearerResponse = await handler(
			new Request("https://api.example.com", {
				headers: { authorization: `bEaReR ${jwt}`, origin: "https://untrusted.example.com" },
			}),
		);
		expect((await bearerResponse.json()).principal.email).toBe(ROOT_USER_EMAIL);
		const otherCookieResponse = await handler(
			new Request("https://api.example.com", {
				headers: { cookie: `other-token=${jwt}` },
			}),
		);
		expect((await otherCookieResponse.json()).principal.email).toBe(ANONYMOUS_USER_EMAIL);

		const proxied = await handler(
			new Request("http://internal:7180", {
				headers: {
					cookie: `token=${jwt}`,
					origin: "https://api.example.com",
					"sec-fetch-site": "same-origin",
				},
			}),
		);
		expect((await proxied.json()).principal.email).toBe(ROOT_USER_EMAIL);
		expect(proxied.headers.get("Vary")).toContain("Sec-Fetch-Site");
		for (const fetchSite of ["same-site", "cross-site"]) {
			const response = await handler(
				new Request("http://internal:7180", {
					headers: { cookie: `token=${jwt}`, "sec-fetch-site": fetchSite },
				}),
			);
			expect((await response.json()).principal.email).toBe(ANONYMOUS_USER_EMAIL);
		}
	});
});
