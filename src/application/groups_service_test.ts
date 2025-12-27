import { describe, it } from "bdd";
import { expect } from "expect";
import { GroupsService } from "./groups_service.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { ADMINS_GROUP_UUID, ANONYMOUS_GROUP_UUID } from "domain/configuration/builtin_groups.ts";

describe("GroupsService", () => {
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
			groups: ["some-group"],
		},
		mode: "Action",
	};

	describe("listGroups", () => {
		it("should list builtin groups", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const result = await service.listGroups(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const groups = result.value;
				expect(groups.length).toBeGreaterThanOrEqual(2);

				const adminGroup = groups.find((g) => g.uuid === ADMINS_GROUP_UUID);
				expect(adminGroup).toBeDefined();
				expect(adminGroup?.title).toBe("Admins");

				const anonGroup = groups.find((g) => g.uuid === ANONYMOUS_GROUP_UUID);
				expect(anonGroup).toBeDefined();
				expect(anonGroup?.title).toBe("Anonymous");
			}
		});

		it("should list custom groups along with builtins", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			// Create a custom group
			await service.createGroup(adminCtx, {
				title: "Editors",
				description: "Content editors",
			});

			const result = await service.listGroups(adminCtx);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const groups = result.value;
				expect(groups.length).toBeGreaterThanOrEqual(3);

				const editorsGroup = groups.find((g) => g.title === "Editors");
				expect(editorsGroup).toBeDefined();
			}
		});
	});

	describe("getGroup", () => {
		it("should get builtin admin group", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const result = await service.getGroup(adminCtx, ADMINS_GROUP_UUID);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(ADMINS_GROUP_UUID);
				expect(result.value.title).toBe("Admins");
			}
		});

		it("should get builtin anonymous group", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const result = await service.getGroup(adminCtx, ANONYMOUS_GROUP_UUID);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.uuid).toBe(ANONYMOUS_GROUP_UUID);
				expect(result.value.title).toBe("Anonymous");
			}
		});

		it("should get custom group", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const createResult = await service.createGroup(adminCtx, {
				title: "Reviewers",
				description: "Content reviewers",
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const getResult = await service.getGroup(adminCtx, createResult.value.uuid);
				expect(getResult.isRight()).toBe(true);
				if (getResult.isRight()) {
					expect(getResult.value.title).toBe("Reviewers");
					expect(getResult.value.description).toBe("Content reviewers");
				}
			}
		});

		it("should return error for non-existent group", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const result = await service.getGroup(adminCtx, "non-existent-uuid");

			expect(result.isLeft()).toBe(true);
		});
	});

	describe("createGroup", () => {
		it("should create group when user is admin", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const result = await service.createGroup(adminCtx, {
				title: "Developers",
				description: "Development team",
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.title).toBe("Developers");
				expect(result.value.description).toBe("Development team");
				expect(result.value.uuid).toBeDefined();
				expect(result.value.createdTime).toBeDefined();
			}
		});

		it("should fail when user is not admin", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const result = await service.createGroup(nonAdminCtx, {
				title: "Unauthorized",
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ForbiddenError");
			}
		});

		it("should validate group title length", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const result = await service.createGroup(adminCtx, {
				title: "AB", // Too short
			});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("ValidationError");
			}
		});
	});

	describe("deleteGroup", () => {
		it("should delete custom group when user is admin", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const createResult = await service.createGroup(adminCtx, {
				title: "Temporary Group",
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const deleteResult = await service.deleteGroup(adminCtx, createResult.value.uuid);
				expect(deleteResult.isRight()).toBe(true);

				// Verify it's deleted
				const getResult = await service.getGroup(adminCtx, createResult.value.uuid);
				expect(getResult.isLeft()).toBe(true);
			}
		});

		it("should fail when user is not admin", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const createResult = await service.createGroup(adminCtx, {
				title: "Test Group",
			});

			expect(createResult.isRight()).toBe(true);
			if (createResult.isRight()) {
				const deleteResult = await service.deleteGroup(
					nonAdminCtx,
					createResult.value.uuid,
				);

				expect(deleteResult.isLeft()).toBe(true);
				if (deleteResult.isLeft()) {
					expect(deleteResult.value.errorCode).toBe("ForbiddenError");
				}
			}
		});

		it("should not allow deleting builtin groups", async () => {
			const configRepo = new InMemoryConfigurationRepository();
			const service = new GroupsService(configRepo);

			const result = await service.deleteGroup(adminCtx, ADMINS_GROUP_UUID);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.errorCode).toBe("BadRequestError");
			}
		});
	});
});
