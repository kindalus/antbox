import { describe, it } from "bdd";
import { expect } from "expect";
import { SignJWT } from "jose";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { ApiKeysService } from "application/security/api_keys_service.ts";
import { ExternalLoginService } from "application/security/external_login_service.ts";
import { UsersService } from "application/security/users_service.ts";
import { Users } from "domain/users_groups/users.ts";
import { webdavMiddlewareChain } from "./webdav_middleware.ts";

function tenant(name: string): AntboxTenant {
	const config = new InMemoryConfigurationRepository();
	return {
		name,
		symmetricKey: `signing-key-${name}`,
		apiKeysService: new ApiKeysService(config),
		externalLoginService: new ExternalLoginService(new UsersService(config), {
			type: "local",
			jwks: { keys: [] },
		}),
	} as unknown as AntboxTenant;
}

async function basicRoot(selected: AntboxTenant) {
	const token = await new SignJWT({})
		.setProtectedHeader({ alg: "HS256" })
		.setIssuer("urn:antbox")
		.setAudience(selected.name)
		.setExpirationTime("1h")
		.sign(new TextEncoder().encode(selected.symmetricKey));
	return `Basic ${btoa(`jwt:${token}`)}`;
}

describe("WebDAV authentication routing", () => {
	it("authenticates against the exact tenant in the URL without extra headers", async () => {
		const tenants = [tenant("first"), tenant("second")];
		const handler = webdavMiddlewareChain(
			tenants,
			(req) => Promise.resolve(Response.json(getAuthenticationContext(req))),
		);
		const response = await handler(
			new Request("http://localhost/webdav/second/", {
				headers: { authorization: await basicRoot(tenants[1]) },
			}),
		);
		expect(response.status).toBe(200);
		const context = await response.json();
		expect(context.tenant).toBe("second");
		expect(context.principal.email).toBe(Users.ROOT_USER_EMAIL);
	});

	it("rejects conflicting selectors and malformed or unknown tenant paths before dispatch", async () => {
		const tenants = [tenant("first"), tenant("second")];
		let calls = 0;
		const handler = webdavMiddlewareChain(tenants, () => {
			calls++;
			return Promise.resolve(new Response("unexpected"));
		});
		const authorization = await basicRoot(tenants[1]);
		for (
			const [path, headers] of [
				["/webdav/second/", { "X-Tenant": "first" }],
				["/webdav/second/?x-tenant=first", {}],
				["/webdav/second-suffix/", {}],
				["/webdav/%invalid/", {}],
				["/webdav/", {}],
			] as const
		) {
			const response = await handler(
				new Request(`http://localhost${path}`, {
					headers: { authorization, ...headers },
				}),
			);
			expect(response.status).toBe(400);
		}
		expect(calls).toBe(0);
	});

	it("returns an authentication challenge for malformed and invalid Basic credentials", async () => {
		let calls = 0;
		const handler = webdavMiddlewareChain([tenant("first")], () => {
			calls++;
			return Promise.resolve(new Response("unexpected"));
		});
		for (
			const authorization of [
				"Basic %%invalid",
				"Bearer malformed",
				`Basic ${btoa("email:password")}`,
				`Basic ${btoa("jwt:")}`,
				`Basic ${btoa("jwt:not-a-jwt")}`,
				`Basic ${btoa("key:unknown-key")}`,
				...(["jwt", "key"].flatMap((user) =>
					["\r\n", "\0"].map((control) => `Basic ${btoa(`${user}:one${control}two`)}`)
				)),
			]
		) {
			const response = await handler(
				new Request("http://localhost/webdav/first/", {
					headers: { authorization },
				}),
			);
			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
		}
		expect(calls).toBe(0);
	});
});
