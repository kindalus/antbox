import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { UsersGroupsService } from "./users_groups_service.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { Users } from "domain/users_groups/users.ts";
import { UserNotFoundError } from "domain/users_groups/user_not_found_error.ts";
import GroupNotFoundError from "domain/users_groups/group_not_found_error.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { errToMsg } from "shared/test_helpers.ts";
import { NodeService } from "./node_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";

describe("UsersGroupsService", () => {
	describe("updateUser", () => {
		it("should update the user", async () => {
			const service = usersGroupsService();

			const createdUserOrErr = await service.createUser(authCtx, {
				name: "The Name",
				email: "dennis@gmail.com",
				groups: ["--test-users-group--"],
			});

			const voidOrErr = await service.updateUser(
				authCtx,
				createdUserOrErr.right.email,
				{ name: "James Smith" },
			);

			expect(voidOrErr.isRight(), errToMsg(voidOrErr.value)).toBeTruthy();

			const updated = (await service.getUser(authCtx, createdUserOrErr.right.email!)).right;
			expect(updated.name).toBe("James Smith");
		});

		it("should not update email", async () => {
			const service = usersGroupsService();

			const createdUserOrErr = await service.createUser(authCtx, {
				name: "The Name",
				email: "bale@gmail.com",
				groups: ["--test-users-group--"],
			});

			const voidOrErr = await service.updateUser(
				authCtx,
				createdUserOrErr.right.email,
				{
					email: "lande@gmail.com",
				},
			);

			expect(voidOrErr.isRight()).toBeTruthy();

			const updatedUserOrErr = await service.getUser(
				authCtx,
				createdUserOrErr.right.email,
			);
			expect(updatedUserOrErr.isRight(), errToMsg(updatedUserOrErr.value))
				.toBeTruthy();
			expect(updatedUserOrErr.right.email).toBe("bale@gmail.com");
		});

		it("should return error if user not found", async () => {
			const service = usersGroupsService();

			const voidOrErr = await service.updateUser(authCtx, "any uuid", {
				name: "James Smith",
			});

			expect(voidOrErr.isLeft()).toBeTruthy();
			expect(voidOrErr.value).toBeInstanceOf(UserNotFoundError);
		});

		it("should not udpdate builtin root user", async () => {
			const service = usersGroupsService();

			const voidOrErr = await service.updateUser(authCtx, Users.ROOT_USER_EMAIL, {
				name: "Anonymous",
				email: "james@gmail.com",
			});

			expect(voidOrErr.isLeft()).toBeTruthy();
			expect(voidOrErr.value).toBeInstanceOf(BadRequestError);
		});

		it("should not udpdate builtin anonymous user", async () => {
			const service = usersGroupsService();

			const voidOrErr = await service.updateUser(
				authCtx,
				Users.ANONYMOUS_USER_EMAIL,
				{
					name: "root",
				},
			);

			expect(voidOrErr.isLeft()).toBeTruthy();
			expect(voidOrErr.value).toBeInstanceOf(BadRequestError);
		});
	});

	describe("updateGroup", () => {
		it("should update the group", async () => {
			const service = usersGroupsService();

			const createdGroupOrErr = await service.createGroup(authCtx, {
				uuid: "--title--",
				title: "The title",
			});

			const voidOrErr = await service.updateGroup(
				authCtx,
				createdGroupOrErr.right.uuid,
				{
					title: "Updated title",
				},
			);

			expect(voidOrErr.isRight()).toBeTruthy();

			const updatedGroupOrErr = await service.getGroup(
				authCtx,
				createdGroupOrErr.right.uuid,
			);
			expect(updatedGroupOrErr.isRight(), errToMsg(updatedGroupOrErr.value))
				.toBeTruthy();
			expect(updatedGroupOrErr.right.title).toBe("Updated title");
		});

		it("should return error if group not found", async () => {
			const service = usersGroupsService();

			(await service.createUser(authCtx, {
				name: "The title",
				uuid: "doily-uuid",
				email: "doily@gmail.com",
				groups: ["--test-users-group--"],
			})).right;

			const voidOrErr = await service.updateGroup(authCtx, "doily-uuid", {
				title: "The title",
			});

			expect(voidOrErr.isLeft()).toBeTruthy();
			expect(voidOrErr.value).toBeInstanceOf(GroupNotFoundError);
		});

		it("should not update builtin group", async () => {
			const service = usersGroupsService();

			const voidOrErr = await service.updateGroup(
				authCtx,
				Groups.ADMINS_GROUP_UUID,
				{ title: "The title" },
			);

			expect(voidOrErr.isLeft()).toBeTruthy();
			expect(voidOrErr.value).toBeInstanceOf(BadRequestError);
		});
	});
});

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "default",
	principal: {
		email: "user@dmain.com",
		groups: [Groups.ADMINS_GROUP_UUID],
	},
};

const goupNode: GroupNode = GroupNode.create({
	uuid: "--test-users-group--",
	title: "The title",
	owner: Users.ROOT_USER_EMAIL,
}).right;

const repository = new InMemoryNodeRepository();
repository.add(goupNode);

const usersGroupsService = (
	opts: Partial<NodeServiceContext> = { repository: repository },
) => {
	const nodeService = new NodeService({
		storage: opts.storage ?? new InMemoryStorageProvider(),
		repository: opts.repository ?? new InMemoryNodeRepository(),
		bus: opts.bus ?? new InMemoryEventBus(),
	});

	return new UsersGroupsService(nodeService);
};
