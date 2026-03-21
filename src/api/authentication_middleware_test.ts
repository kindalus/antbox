import { describe, it } from "bdd";
import { expect } from "expect";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { ApiKeysService } from "application/security/api_keys_service.ts";
import { ExternalLoginService } from "application/security/external_login_service.ts";
import { UsersService } from "application/security/users_service.ts";
import type { AuthenticationContext } from "application/security/authentication_context.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { authenticationMiddleware } from "./authentication_middleware.ts";

describe("authenticationMiddleware", () => {
	const adminCtx: AuthenticationContext = {
		tenant: "default",
		principal: {
			email: "admin@example.com",
			groups: [ADMINS_GROUP_UUID],
		},
		mode: "Action",
	};

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
	});
});
