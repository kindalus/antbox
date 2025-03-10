import { describe, test, expect } from "bun:test";
import { UsersGroupsService } from "./users_groups_service";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";
import type { UsersGroupsContext } from "./users_groups_service_context";
import { Groups } from "domain/users_groups/groups";
import { Nodes } from "domain/nodes/nodes";
import GroupNotFoundError from "domain/users_groups/group_not_found_error";
import { UserNotFoundError } from "domain/users_groups/user_not_found_error";
import { Users } from "domain/users_groups/users";

describe("UsersGroupsService.getUser", () => {
    test("should return user from repository", async () => {
        const service = usersGroupsService();

        await service.createUser({
            title: "The title",
            owner: "root@gmail.com",
            uuid: "my-uuid",
            email: "tyrion@gmail.com",
            username: "tyrionkrull",
            group: Groups.ADMINS_GROUP_UUID,
        });
    
        const userOrErr = await service.getUser("my-uuid");

        expect(userOrErr.value, errToMsg(userOrErr.value)).toBeTruthy();
        expect(userOrErr.right.owner).toBe("root@gmail.com");
        expect(userOrErr.right.username).toBe("tyrionkrull");
    });

    test("should return user if uuid is in fid format", async () => {
        const service = usersGroupsService();

        await service.createUser({
            title: "The title",
            owner: "root@gmail.com",
            fid: "the-id",
            email: "tyrion@gmail.com",
            username: "krull",
            group: Groups.ADMINS_GROUP_UUID,
        });
    
        const userOrErr = await service.getUser("--fid--the-id");

        expect(userOrErr.value, errToMsg(userOrErr.value)).toBeTruthy();
        expect(userOrErr.right.owner).toBe("root@gmail.com");
        expect(userOrErr.right.username).toBe("krull");
    });

    // test("should return builtin user root", async () => {
    //     const service = usersGroupsService();

    //     const userOrErr = await service.getUser(Users.ROOT_USER_UUID);

    //     expect(userOrErr.value, errToMsg(userOrErr.value)).toBeTruthy();
    //     expect(userOrErr.right.uuid).toBe(Users.ROOT_USER_UUID);
    //     expect(userOrErr.right.email).toBe(Users.ROOT_USER_EMAIL);
    //     expect(userOrErr.right.group).toBe(Groups.ADMINS_GROUP_UUID);
    // });

    test("should return error if user is not found", async () => {
        const service = usersGroupsService();

        const userOrErr = await service.getUser("--any uuid--");
        
        expect(userOrErr.isLeft(), errToMsg(userOrErr.value)).toBeTruthy();
        expect(userOrErr.value).toBeInstanceOf(UserNotFoundError);
    });
});

describe("UsersGroupsService.getGroup", () => {
    test("should return user from repository", async () => {
        const service = usersGroupsService();

        await service.createGroup({
            title: "The title",
            owner: "root@gmail.com",
            uuid: "gp-uuid",
        });
    
        const userOrErr = await service.getGroup("gp-uuid");

        expect(userOrErr.value, errToMsg(userOrErr.value)).toBeTruthy();
        expect(userOrErr.right.owner).toBe("root@gmail.com");
        expect(userOrErr.right.mimetype).toBe(Nodes.GROUP_MIMETYPE);
    });

    test("should return group if uuid is in fid format", async () => {
        const service = usersGroupsService();

        await service.createGroup({
            title: "The title",
            owner: "root@gmail.com",
            fid: "fid-uuid",
        });
    
        const groupOrErr = await service.getGroup("--fid--fid-uuid");

        expect(groupOrErr.value, errToMsg(groupOrErr.value)).toBeTruthy();
        expect(groupOrErr.right.owner).toBe("root@gmail.com");
        expect(groupOrErr.right.mimetype).toBe(Nodes.GROUP_MIMETYPE);
    });

    test("should return error if group is not found", async () => {
        const service = usersGroupsService();

        const groupOrErr = await service.getGroup("--any group uuid--");
        
        expect(groupOrErr.isLeft(), errToMsg(groupOrErr.value)).toBeTruthy();
        expect(groupOrErr.value).toBeInstanceOf(GroupNotFoundError);
    });
});

const usersGroupsService = (opts: Partial<UsersGroupsContext> = {}) =>
  new UsersGroupsService({
    storage: opts.storage ?? new InMemoryStorageProvider(),
    repository: opts.repository ?? new InMemoryNodeRepository(),
    bus: opts.bus ?? new InMemoryEventBus(),
});

const errToMsg = (err: any) => (err.message ? err.message : JSON.stringify(err))
