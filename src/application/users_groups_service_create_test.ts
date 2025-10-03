import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import type { UsersGroupsContext } from "./users_groups_service_context.ts";
import { ValidationError } from "shared/validation_error.ts";
import { UserExistsError } from "domain/users_groups/user_exists_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Users } from "domain/users_groups/users.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Folders } from "domain/nodes/folders.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { UserNode } from "domain/users_groups/user_node.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";

describe("UsersGroupsService.createUser", () => {
	it("should create the user", async () => {
		const service = usersGroupsService();

		await service.createUser(authCtx, {
			name: "The title",
			email: "joane@gmail.com",
			groups: ["--admins--", "--users--"],
		});

		const userOrErr = await service.getUser(authCtx, "joane@gmail.com");

		expect(userOrErr.isRight(), errToMsg(userOrErr.value)).toBeTruthy();
		expect(userOrErr.right.name).toBe("The title");
		expect(userOrErr.right.email).toBe("joane@gmail.com");
	});

	it("should remove duplicated groups", async () => {
		const service = usersGroupsService();

		await service.createUser(authCtx, {
			name: "The title",
			email: "duck@gmail.com",
			groups: ["--users--", "--admins--", "--admins--", "--ultimate--"],
		});

		const userOrErr = await service.getUser(authCtx, "duck@gmail.com");

		expect(userOrErr.isRight(), errToMsg(userOrErr.value)).toBeTruthy();
		expect(userOrErr.right.email).toBe("duck@gmail.com");
		expect(userOrErr.right.groups).toEqual([
			"--admins--",
			"--ultimate--",
		]);
	});

	it("should return error if user already exists", async () => {
		const service = usersGroupsService();

		await service.createUser(authCtx, {
			name: "The title",
			email: "tyrion@gmail.com",
			groups: ["--admins--", "--users--"],
		});

		const userOrErr = await service.createUser(authCtx, {
			name: "The title",
			email: "tyrion@gmail.com",
			groups: ["--admins--", "--users--"],
		});

		expect(userOrErr.isLeft(), errToMsg(userOrErr.value)).toBeTruthy();
		expect(userOrErr.value).toBeInstanceOf(ValidationError);
		expect((userOrErr.value as ValidationError).errors[0]).toBeInstanceOf(
			UserExistsError,
		);
	});

	it("should return error if user group not found", async () => {
		const service = usersGroupsService();

		const userOrErr = await service.createUser(authCtx, {
			name: "The title",
			email: "kyle@gmail.com",
			groups: ["--the user--"],
		});

		expect(userOrErr.isLeft(), errToMsg(userOrErr.value)).toBeTruthy();
		expect(userOrErr.value).toBeInstanceOf(ValidationError);
		expect((userOrErr.value as ValidationError).errors[0]).toBeInstanceOf(
			NodeNotFoundError,
		);
	});
});

describe("UsersGroupsService.createGroup", () => {
	it("should create group and persist metadata", async () => {
		const service = usersGroupsService();

		await service.createGroup(authCtx, {
			title: "The Title",
			uuid: "--group-uuid--",
		});

		const groupOrErr = await service.getGroup("--group-uuid--");

		expect(groupOrErr.isRight(), errToMsg(groupOrErr.value)).toBeTruthy();
		expect(groupOrErr.right.mimetype).toBe(Nodes.GROUP_MIMETYPE);
		expect(groupOrErr.right.parent).toBe(Folders.GROUPS_FOLDER_UUID);
	});
});

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "default",
	principal: {
		email: "user@dmain.com",
		groups: ["group1", Groups.ADMINS_GROUP_UUID],
	},
};

const userNode: UserNode = UserNode.create({
	uuid: "550e8400-e29b-41d4-a716-446655440000",
	title: "James Smith",
	email: "james@gmail.com",
	group: "user group",
	owner: Users.ROOT_USER_EMAIL,
}).right;

const firstGoupNode: GroupNode = GroupNode.create({
	uuid: "--admins--",
	title: "The first title",
	owner: Users.ROOT_USER_EMAIL,
}).right;

const secondGoupNode: GroupNode = GroupNode.create({
	uuid: "--users--",
	title: "The second title",
	owner: Users.ROOT_USER_EMAIL,
}).right;

const thirdGoupNode: GroupNode = GroupNode.create({
	uuid: "--ultimate--",
	title: "The third title",
	owner: Users.ROOT_USER_EMAIL,
}).right;

const repository = new InMemoryNodeRepository();
repository.add(userNode);
repository.add(firstGoupNode);
repository.add(secondGoupNode);
repository.add(thirdGoupNode);

const usersGroupsService = (
	opts: Partial<UsersGroupsContext> = { repository },
) =>
	new UsersGroupsService({
		storage: opts.storage ?? new InMemoryStorageProvider(),
		repository: opts.repository ?? new InMemoryNodeRepository(),
		bus: opts.bus ?? new InMemoryEventBus(),
	});

const errToMsg = (
	// deno-lint-ignore no-explicit-any
	err: any,
) => (err.message ? err.message : JSON.stringify(err));
