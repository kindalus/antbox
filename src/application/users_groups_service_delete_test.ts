import { describe, test } from "bdd";
import { expect } from "expect";
import { UsersGroupsService } from "./users_groups_service.ts";
import type { UsersGroupsContext } from "./users_groups_service_context.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { UserNotFoundError } from "domain/users_groups/user_not_found_error.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { Users } from "domain/users_groups/users.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";

describe("UsersGroupsService.deleteUser", () => {
	test("should delete the user", async () => {
		const service = usersGroupsService();

		const createdUserOrErr = await service.createUser(authCtx, {
			name: "The title",
			email: "debora@gmail.com",
			groups: ["--users--"],
		});

		const voidOrErr = await service.deleteUser(createdUserOrErr.right.uuid!);

		expect(voidOrErr.isRight(), errToMsg(voidOrErr.value)).toBeTruthy();

		const deletedUserOrErr = await service.getUser(
			authCtx,
			createdUserOrErr.right.email,
		);
		expect(deletedUserOrErr.isLeft(), errToMsg(deletedUserOrErr.value))
			.toBeTruthy();
		expect(deletedUserOrErr.value).toBeInstanceOf(UserNotFoundError);
	});

	test("should return error if user not found", async () => {
		const service = usersGroupsService();

		const deletedUserOrErr = await service.deleteUser("any-delete-uuid");

		expect(deletedUserOrErr.isLeft(), errToMsg(deletedUserOrErr.value))
			.toBeTruthy();
		expect(deletedUserOrErr.value).toBeInstanceOf(UserNotFoundError);
	});

	test("should not delete builtin root user", async () => {
		const service = usersGroupsService();

		const deletedUserOrErr = await service.deleteUser(Users.ROOT_USER_UUID);

		expect(deletedUserOrErr.isLeft(), errToMsg(deletedUserOrErr.value))
			.toBeTruthy();
		expect(deletedUserOrErr.value).toBeInstanceOf(BadRequestError);
	});

	test("should not delete builtin anonymous user", async () => {
		const service = usersGroupsService();

		const deletedUserOrErr = await service.deleteUser(
			Users.ANONYMOUS_USER_UUID,
		);

		expect(deletedUserOrErr.isLeft(), errToMsg(deletedUserOrErr.value))
			.toBeTruthy();
		expect(deletedUserOrErr.value).toBeInstanceOf(BadRequestError);
	});
});

describe("UsersGroupsService.deleteGroup", () => {
	test("should delete the group", async () => {
		const service = usersGroupsService();

		const createdGroupOrErr = await service.createGroup(authCtx, {
			uuid: "--title--",
			title: "The title",
		});

		const voidOrErr = await service.deleteGroup(createdGroupOrErr.right.uuid);

		expect(voidOrErr.isRight(), errToMsg(voidOrErr.value)).toBeTruthy();

		const deletedGroup = await service.getGroup(createdGroupOrErr.right.uuid);
		expect(deletedGroup.isLeft(), errToMsg(deletedGroup.value)).toBeTruthy();
		expect(deletedGroup.value).toBeInstanceOf(NodeNotFoundError);
	});

	test("should return error if group not found", async () => {
		const service = usersGroupsService();

		const deletedGroup = await service.deleteGroup("any-detele-group-uuid");

		expect(deletedGroup.isLeft(), errToMsg(deletedGroup.value)).toBeTruthy();
		expect(deletedGroup.value).toBeInstanceOf(NodeNotFoundError);
	});

	test("should not delete builtin admins group", async () => {
		const service = usersGroupsService();

		const deletedGroup = await service.deleteGroup(Groups.ADMINS_GROUP_UUID);

		expect(deletedGroup.isLeft(), errToMsg(deletedGroup.value)).toBeTruthy();
		expect(deletedGroup.value).toBeInstanceOf(BadRequestError);
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
	uuid: "--users--",
	title: "The title",
	owner: Users.ROOT_USER_EMAIL,
}).right;

const repository = new InMemoryNodeRepository();
repository.add(goupNode);

const usersGroupsService = (
	opts: Partial<UsersGroupsContext> = { repository },
) =>
	new UsersGroupsService({
		storage: opts.storage ?? new InMemoryStorageProvider(),
		repository: opts.repository ?? new InMemoryNodeRepository(),
		bus: opts.bus ?? new InMemoryEventBus(),
	});

const errToMsg = (err: unknown) => {
	if (err instanceof Error) {
		return `Error: ${err.message}`;
	}

	return `Error: ${JSON.stringify(err, null, 2)}`;
};
