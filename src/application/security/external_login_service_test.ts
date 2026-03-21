import { describe, it } from "bdd";
import { expect } from "expect";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { stub } from "mock";

import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { Logger } from "shared/logger.ts";
import { UsersService } from "./users_service.ts";
import { ExternalLoginService } from "./external_login_service.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";

describe("ExternalLoginService", () => {
	const adminCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "admin@example.com",
			groups: [ADMINS_GROUP_UUID],
		},
		mode: "Action",
	};

	async function createFixture() {
		const repo = new InMemoryConfigurationRepository();
		const usersService = new UsersService(repo);
		const { publicKey, privateKey } = await generateKeyPair("RS256");
		const rawJwks = {
			keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", kid: "test-key" }],
		};

		await usersService.createUser(adminCtx, {
			email: "john.doe@example.com",
			title: "John Doe",
			group: "developers",
			groups: ["developers", "staff"],
			phone: "+1234567890",
			hasWhatsapp: true,
			active: true,
		});

		const service = new ExternalLoginService(usersService, {
			type: "local",
			jwks: rawJwks,
		});

		return { privateKey, service };
	}

	async function signToken(
		privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"],
		claims: Record<string, unknown>,
	): Promise<string> {
		return new SignJWT(claims)
			.setProtectedHeader({ alg: "RS256", kid: "test-key" })
			.setIssuedAt()
			.setIssuer("external-idp")
			.setExpirationTime("1h")
			.sign(privateKey);
	}

	it("challenge succeeds for a user found by email", async () => {
		const { privateKey, service } = await createFixture();
		const token = await signToken(privateKey, { email: "john.doe@example.com" });

		const result = await service.challenge(token);

		expect(result.isRight()).toBe(true);
	});

	it("challenge returns not found when no matching user exists", async () => {
		const { privateKey, service } = await createFixture();
		const token = await signToken(privateKey, { email: "missing@example.com" });

		const result = await service.challenge(token);

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.errorCode).toBe("NotFoundError");
		}
	});

	it("login resolves a user by phone when email is absent", async () => {
		const { privateKey, service } = await createFixture();
		const token = await signToken(privateKey, { phone_number: "+1234567890" });

		const result = await service.login(token);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value.email).toBe("john.doe@example.com");
			expect(result.value.name).toBe("John Doe");
			expect(result.value.groups).toEqual(expect.arrayContaining(["developers", "staff"]));
		}
	});

	it("prefers email when both email and phone claims are present", async () => {
		const { privateKey, service } = await createFixture();
		const token = await signToken(privateKey, {
			email: "john.doe@example.com",
			phone_number: "+0000000000",
		});

		const result = await service.login(token);

		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value.email).toBe("john.doe@example.com");
		}
	});

	it("rejects JWTs without email or phone claims", async () => {
		const { privateKey, service } = await createFixture();
		const token = await signToken(privateKey, { sub: "123" });

		const result = await service.login(token);

		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) {
			expect(result.value.message).toContain("email or phone number");
		}
	});

	it("logs a warning when external JWT verification fails", async () => {
		const { service } = await createFixture();
		const { privateKey: otherPrivateKey } = await generateKeyPair("RS256");
		const token = await signToken(otherPrivateKey, { email: "john.doe@example.com" });
		const warnings: unknown[][] = [];
		const loggerWarn = stub(Logger, "warn", (...args: unknown[]) => {
			warnings.push(args);
		});

		try {
			const result = await service.resolvePrincipal(token);

			expect(result.isLeft()).toBe(true);
			expect(warnings).toHaveLength(1);
			expect(warnings[0][0]).toBe("External token JWT verification failed");
			expect(warnings[0][1]).toMatchObject({
				issuer: "external-idp",
			});
			expect((warnings[0][1] as { error: string }).error).toContain("signature verification");
		} finally {
			loggerWarn.restore();
		}
	});
});
