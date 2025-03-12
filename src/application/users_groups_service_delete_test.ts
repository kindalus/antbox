import { describe, test, expect } from "bun:test";
import { UsersGroupsService } from "./users_groups_service";
import type { UsersGroupsContext } from "./users_groups_service_context";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";
import { servicesVersion } from "typescript";
import type { AuthenticationContext } from "./authentication_context";
import { Groups } from "domain/users_groups/groups";
import { UserNotFoundError } from "domain/users_groups/user_not_found_error";
import { GroupNode } from "domain/users_groups/group_node";
import { Users } from "domain/users_groups/users";
import { BadRequestError } from "shared/antbox_error";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";

describe("UsersGroupsService.deleteUser", () => {
    test("should delete the user", async () => {
        const service = usersGroupsService();

        const createdUserOrErr = await service.createUser(authCtx, {
            title: "The title",
            owner: "root@gmail.com",
            uuid: "bale-uuid",
            email: "bale@gmail.com",
            groups: ["--users--"],
        });

        const voidOrErr = await service.deleteUser(authCtx, createdUserOrErr.right.uuid);

        expect(voidOrErr.isRight(), errToMsg(voidOrErr.value)).toBeTruthy();

        const deletedUserOrErr = await service.getUser(authCtx, createdUserOrErr.right.uuid)
        expect(deletedUserOrErr.isLeft(), errToMsg(deletedUserOrErr.value)).toBeTruthy();
        expect(deletedUserOrErr.value).toBeInstanceOf(UserNotFoundError);
    });

    test("should return error if user not found", async () => {
        const service = usersGroupsService();

        const deletedUserOrErr = await service.deleteUser(authCtx, "any-delete-uuid");

        expect(deletedUserOrErr.isLeft(), errToMsg(deletedUserOrErr.value)).toBeTruthy();
        expect(deletedUserOrErr.value).toBeInstanceOf(UserNotFoundError);
    });

    test("should not delete builtin root user", async () => {
        const service =  usersGroupsService();

        const deletedUserOrErr = await service.deleteUser(authCtx, Users.ROOT_USER_UUID);

        expect(deletedUserOrErr.isLeft(), errToMsg(deletedUserOrErr.value)).toBeTruthy();
        expect(deletedUserOrErr.value).toBeInstanceOf(BadRequestError)
    });

    test("should not delete builtin anonymous user", async () => {
        const service =  usersGroupsService();

        const deletedUserOrErr = await service.deleteUser(authCtx, Users.ANONYMOUS_USER_UUID);

        expect(deletedUserOrErr.isLeft(), errToMsg(deletedUserOrErr.value)).toBeTruthy();
        expect(deletedUserOrErr.value).toBeInstanceOf(BadRequestError)
    });
});

describe("UsersGroupsService.deleteGroup", () => {
    test("should delete the group", async () => {
        const service = usersGroupsService();

        const createdGroupOrErr = await service.createGroup({
            uuid: "--title--",
            title: "The title",
            owner: Users.ROOT_USER_EMAIL,
        });

        const voidOrErr = await service.deleteGroup(createdGroupOrErr.right.uuid);

        expect(voidOrErr.isRight(), errToMsg(voidOrErr.value)).toBeTruthy();
        
        const deletedGroup = await service.getGroup(createdGroupOrErr.right.uuid);
        expect(deletedGroup.isLeft(), errToMsg(deletedGroup.value)).toBeTruthy();
        expect(deletedGroup.value).toBeInstanceOf(NodeNotFoundError);
    });

    test("should return error if group not found", async () => {
        const service =  usersGroupsService();

        const deletedGroup = await service.deleteGroup("any-detele-group-uuid");

        expect(deletedGroup.isLeft(), errToMsg(deletedGroup.value)).toBeTruthy();
        expect(deletedGroup.value).toBeInstanceOf(NodeNotFoundError);
    });

    test("should not delete builtin admins group", async () => {
        const service =  usersGroupsService();

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

const usersGroupsService = (opts: Partial<UsersGroupsContext> = { repository: repository }) => new UsersGroupsService({
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