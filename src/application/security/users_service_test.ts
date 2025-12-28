import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { UsersService } from "./users_service.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { ADMINS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";
import {
	ANONYMOUS_USER_EMAIL,
	BUILTIN_USERS,
	ROOT_USER_EMAIL,
} from "domain/configuration/builtin_users.ts";

describe("UsersService", () => {
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

	describe("createUser", () => {
		it("should create user successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers", "engineers"],
				phone: "+1234567890",
				hasWhatsapp: true,
				active: true,
			};

			const result = await service.createUser(adminCtx, userData);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const user = result.value;
				expect(user.email).toBe(userData.email);
				expect(user.title).toBe(userData.title);
				expect(user.group).toBe(userData.group);
				expect(user.groups).toEqual(userData.groups);
				expect(user.phone).toBe(userData.phone);
				expect(user.hasWhatsapp).toBe(userData.hasWhatsapp);
				expect(user.active).toBe(userData.active);
				expect(typeof user.createdTime).toBe("string");
				expect(typeof user.modifiedTime).toBe("string");
			}
		});

		it("should reject creation as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			const result = await service.createUser(nonAdminCtx, userData);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should reject invalid email", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "not-an-email",
				title: "John Doe",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			const result = await service.createUser(adminCtx, userData);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ValidationError");
			}
		});

		it("should reject single name title", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "john@example.com",
				title: "John",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			const result = await service.createUser(adminCtx, userData);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ValidationError");
			}
		});

		it("should accept 'root' and 'anonymous' as valid titles", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const rootData = {
				email: "system-root@example.com",
				title: "root",
				group: ADMINS_GROUP_UUID,
				groups: [ADMINS_GROUP_UUID],
				hasWhatsapp: false,
				active: true,
			};

			const rootResult = await service.createUser(adminCtx, rootData);
			expect(rootResult.isRight()).toBe(true);

			const anonData = {
				email: "system-anon@example.com",
				title: "anonymous",
				group: "public",
				groups: ["public"],
				hasWhatsapp: false,
				active: true,
			};

			const anonResult = await service.createUser(adminCtx, anonData);
			expect(anonResult.isRight()).toBe(true);
		});

		it("should create user with minimal data", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "minimal@example.com",
				title: "Minimal User",
				group: "users",
				groups: ["users"],
				hasWhatsapp: false,
				active: true,
			};

			const result = await service.createUser(adminCtx, userData);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.phone).toBeUndefined();
				expect(result.value.hasWhatsapp).toBe(false);
				expect(result.value.active).toBe(true);
			}
		});
	});

	describe("getUser", () => {
		it("should get custom user successfully", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			await service.createUser(adminCtx, userData);
			const result = await service.getUser(adminCtx, "john.doe@example.com");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.email).toBe(userData.email);
				expect(result.value.title).toBe(userData.title);
			}
		});

		it("should get builtin anonymous user", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const result = await service.getUser(adminCtx, ANONYMOUS_USER_EMAIL);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.email).toBe(ANONYMOUS_USER_EMAIL);
				expect(result.value.title).toBe("anonymous");
			}
		});

		it("should get root user as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const result = await service.getUser(adminCtx, ROOT_USER_EMAIL);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.email).toBe(ROOT_USER_EMAIL);
				expect(result.value.title).toBe("root");
			}
		});

		it("should reject root user access as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const result = await service.getUser(nonAdminCtx, ROOT_USER_EMAIL);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should return error for non-existent user", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const result = await service.getUser(adminCtx, "nonexistent@example.com");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});

		it("should allow user to access their own data", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "user@test.com",
				title: "Test User",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			await service.createUser(adminCtx, userData);
			const result = await service.getUser(nonAdminCtx, "user@test.com");

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.email).toBe("user@test.com");
			}
		});

		it("should reject non-admin accessing other user data", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "other@example.com",
				title: "Other User",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			await service.createUser(adminCtx, userData);
			const result = await service.getUser(nonAdminCtx, "other@example.com");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});
	});

	describe("listUsers", () => {
		it("should list custom and builtin users", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			await service.createUser(adminCtx, userData);
			const result = await service.listUsers(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const users = result.value;
				expect(users.length).toBeGreaterThanOrEqual(BUILTIN_USERS.length + 1);

				const johnDoe = users.find((u) => u.email === "john.doe@example.com");
				expect(johnDoe).toBeDefined();

				const builtinEmails = BUILTIN_USERS.map((u) => u.email);
				const hasBuiltins = builtinEmails.every((email) =>
					users.some((u) => u.email === email)
				);
				expect(hasBuiltins).toBe(true);
			}
		});

		it("should reject listing as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const result = await service.listUsers(nonAdminCtx);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});
	});

	describe("updateUser", () => {
		it("should update user successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			await service.createUser(adminCtx, userData);

			const updates = {
				title: "John Smith",
				group: "managers",
				groups: ["managers", "developers"],
				phone: "+9876543210",
				hasWhatsapp: true,
			};

			const result = await service.updateUser(adminCtx, "john.doe@example.com", updates);

			expect(result.isRight()).toBe(true);

			// Verify the update was applied by fetching the user
			const updatedUser = await service.getUser(adminCtx, "john.doe@example.com");
			expect(updatedUser.isRight()).toBe(true);
			if (updatedUser.isRight()) {
				expect(updatedUser.value.email).toBe("john.doe@example.com");
				expect(updatedUser.value.title).toBe("John Smith");
				expect(updatedUser.value.group).toBe("managers");
				expect(updatedUser.value.phone).toBe("+9876543210");
				expect(updatedUser.value.hasWhatsapp).toBe(true);
			}
		});

		it("should allow user to update their own data", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "user@test.com",
				title: "Test User",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			await service.createUser(adminCtx, userData);

			const updates = {
				title: "Updated User",
				phone: "+1234567890",
				hasWhatsapp: true,
			};

			const result = await service.updateUser(nonAdminCtx, "user@test.com", updates);

			expect(result.isRight()).toBe(true);

			// Verify the update was applied by fetching the user
			const updatedUser = await service.getUser(nonAdminCtx, "user@test.com");
			expect(updatedUser.isRight()).toBe(true);
			if (updatedUser.isRight()) {
				expect(updatedUser.value.title).toBe("Updated User");
				expect(updatedUser.value.phone).toBe("+1234567890");
			}
		});

		it("should reject non-admin updating other user data", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			await service.createUser(adminCtx, userData);

			const updates = {
				title: "John Smith",
			};

			const result = await service.updateUser(nonAdminCtx, "john.doe@example.com", updates);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should reject builtin user update", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const updates = {
				title: "Modified Root",
				group: "hackers",
			};

			const result = await service.updateUser(adminCtx, ROOT_USER_EMAIL, updates);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});

		it("should return error for non-existent user", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const updates = {
				title: "John Smith",
			};

			const result = await service.updateUser(adminCtx, "nonexistent@example.com", updates);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});
	});

	describe("deleteUser", () => {
		it("should delete user successfully as admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			await service.createUser(adminCtx, userData);
			const deleteResult = await service.deleteUser(adminCtx, "john.doe@example.com");

			expect(deleteResult.isRight()).toBe(true);

			const getResult = await service.getUser(adminCtx, "john.doe@example.com");
			expect(getResult.isLeft()).toBe(true);
		});

		it("should reject delete as non-admin", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const userData = {
				email: "john.doe@example.com",
				title: "John Doe",
				group: "developers",
				groups: ["developers"],
				hasWhatsapp: false,
				active: true,
			};

			await service.createUser(adminCtx, userData);
			const result = await service.deleteUser(nonAdminCtx, "john.doe@example.com");

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should reject builtin user deletion", async () => {
			const repo = new InMemoryConfigurationRepository();
			const service = new UsersService(repo);

			const result = await service.deleteUser(adminCtx, ROOT_USER_EMAIL);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});
	});
});
