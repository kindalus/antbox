import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { ApiKeysService } from "./api_keys_service.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";

describe("ApiKeysService", () => {
	const adminCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "admin@test.com",
			groups: [ADMINS_GROUP_UUID],
		},
		mode: "Action",
	};

	const nonAdminCtx: AuthenticationContext = {
		tenant: "test",
		principal: {
			email: "user@test.com",
			groups: ["regular-users"],
		},
		mode: "Action",
	};

	describe("createApiKey", () => {
		it("should create API key successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const apiKeyData = {
				title: "Test API Key",
				group: "developers",
				description: "API key for testing",
				active: true,
			};

			const result = await service.createApiKey(adminCtx, apiKeyData);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const apiKey = result.value;
				expect(apiKey.title).toBe("Test API Key");
				expect(apiKey.group).toBe("developers");
				expect(apiKey.description).toBe("API key for testing");
				expect(apiKey.active).toBe(true);
				expect(apiKey.secret).toBeDefined();
				expect(apiKey.secret.length).toBeGreaterThanOrEqual(16);
				expect(typeof apiKey.uuid).toBe("string");
				expect(typeof apiKey.createdTime).toBe("string");
			}
		});

		it("should generate title from secret if not provided", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const apiKeyData = {
				title: "",
				group: "developers",
				active: true,
			};

			const result = await service.createApiKey(adminCtx, apiKeyData);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const apiKey = result.value;
				expect(apiKey.title).toContain("***");
				expect(apiKey.title.length).toBeGreaterThan(4);
			}
		});

		it("should reject creation as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const apiKeyData = {
				title: "Test API Key",
				group: "developers",
				active: true,
			};

			const result = await service.createApiKey(nonAdminCtx, apiKeyData);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should validate group is not empty", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const apiKeyData = {
				title: "Test API Key",
				group: "",
				active: true,
			};

			const result = await service.createApiKey(adminCtx, apiKeyData);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ValidationError");
			}
		});
	});

	describe("getApiKey", () => {
		it("should get API key successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const createResult = await service.createApiKey(adminCtx, {
				title: "Test API Key",
				group: "developers",
				active: true,
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.getApiKey(adminCtx, createResult.value.uuid);

				expect(result.isRight()).toBe(true);
				if (result.isRight()) {
					expect(result.value.uuid).toBe(createResult.value.uuid);
					expect(result.value.title).toBe("Test API Key");
				}
			}
		});

		it("should reject access as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const createResult = await service.createApiKey(adminCtx, {
				title: "Test API Key",
				group: "developers",
				active: true,
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.getApiKey(nonAdminCtx, createResult.value.uuid);

				expect(result.isLeft()).toBe(true);
				if (result.isLeft()) {
					expect(result.value.errorCode).toBe("ForbiddenError");
				}
			}
		});

		it("should return error for non-existent API key", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const result = await service.getApiKey(adminCtx, "nonexistent");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});
	});

	describe("getApiKeyBySecret", () => {
		it("should get API key by secret", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const createResult = await service.createApiKey(adminCtx, {
				title: "Test API Key",
				group: "developers",
				active: true,
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const secret = createResult.value.secret!;
				const result = await service.getApiKeyBySecret(secret);

				expect(result.isRight()).toBe(true);
				if (result.isRight()) {
					expect(result.value.uuid).toBe(createResult.value.uuid);
					expect(result.value.secret).toBe(secret);
				}
			}
		});

		it("should return error for non-existent secret", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const result = await service.getApiKeyBySecret("invalid-secret");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});
	});

	describe("listApiKeys", () => {
		it("should list all API keys as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			await service.createApiKey(adminCtx, {
				title: "API Key 1",
				group: "developers",
				active: true,
			});

			await service.createApiKey(adminCtx, {
				title: "API Key 2",
				group: "testers",
				active: true,
			});

			const result = await service.listApiKeys(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const apiKeys = result.value;
				expect(apiKeys.length).toBe(2);
				expect(apiKeys.some((k) => k.title === "API Key 1")).toBe(true);
				expect(apiKeys.some((k) => k.title === "API Key 2")).toBe(true);
			}
		});

		it("should reject listing as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const result = await service.listApiKeys(nonAdminCtx);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should return empty list when no API keys exist", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const result = await service.listApiKeys(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(0);
			}
		});
	});

	describe("deleteApiKey", () => {
		it("should delete API key successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const createResult = await service.createApiKey(adminCtx, {
				title: "Test API Key",
				group: "developers",
				active: true,
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const deleteResult = await service.deleteApiKey(adminCtx, createResult.value.uuid);

				expect(deleteResult.isRight()).toBe(true);

				// Verify it's deleted
				const getResult = await service.getApiKey(adminCtx, createResult.value.uuid);
				expect(getResult.isLeft()).toBe(true);
			}
		});

		it("should reject delete as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const createResult = await service.createApiKey(adminCtx, {
				title: "Test API Key",
				group: "developers",
				active: true,
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const result = await service.deleteApiKey(nonAdminCtx, createResult.value.uuid);

				expect(result.isLeft()).toBe(true);
				if (result.isLeft()) {
					expect(result.value.errorCode).toBe("ForbiddenError");
				}
			}
		});

		it("should return error when deleting non-existent API key", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const result = await service.deleteApiKey(adminCtx, "nonexistent");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});
	});

	describe("active flag", () => {
		it("should create API key with active=false", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const result = await service.createApiKey(adminCtx, {
				title: "Inactive API Key",
				group: "developers",
				active: false,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.active).toBe(false);
			}
		});

		it("should default active to true if not specified", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new ApiKeysService(repo);

			const result = await service.createApiKey(adminCtx, {
				title: "Default Active API Key",
				group: "developers",
				active: true,
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.active).toBe(true);
			}
		});
	});
});
