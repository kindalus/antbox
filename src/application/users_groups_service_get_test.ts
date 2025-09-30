import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { describe, test } from "bdd";
import { expect } from "expect";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import GroupNotFoundError from "domain/users_groups/group_not_found_error.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { UserNode } from "domain/users_groups/user_node.ts";
import { UserNotFoundError } from "domain/users_groups/user_not_found_error.ts";
import { Users } from "domain/users_groups/users.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { UsersGroupsService } from "./users_groups_service.ts";
import type { UsersGroupsContext } from "./users_groups_service_context.ts";

describe("UsersGroupsService.getUser", () => {
  test("should return user from repository", async () => {
    const service = usersGroupsService();

    const authCtx: AuthenticationContext = {
      mode: "Direct",
      tenant: "default",
      principal: {
        email: "july@gmail.com",
        groups: [Groups.ADMINS_GROUP_UUID],
      },
    };

    await service.createUser(authCtx, {
      name: "The title",
      email: "july@gmail.com",
      groups: ["--admins--", "--users--"],
    });

    const userOrErr = await service.getUser(authCtx, "july@gmail.com");

    expect(userOrErr.value, errToMsg(userOrErr.value)).toBeTruthy();
  });

  test("should return authenticated user", async () => {
    const service = usersGroupsService();

    const authCtx: AuthenticationContext = {
      mode: "Direct",
      tenant: "default",
      principal: {
        email: "kend@gmail.com",
        groups: [Groups.ADMINS_GROUP_UUID],
      },
    };

    await service.createUser(authCtx, {
      name: "The title",
      email: "kend@gmail.com",
      groups: ["--admins--", "--users--"],
    });

    const userOrErr = await service.getUser(authCtx, "kend@gmail.com");

    expect(userOrErr.value, errToMsg(userOrErr.value)).toBeTruthy();
  });

  test("should return builtin user root", async () => {
    const service = usersGroupsService();

    const authCtx: AuthenticationContext = {
      mode: "Direct",
      tenant: "default",
      principal: {
        email: Users.ROOT_USER_EMAIL,
        groups: ["group1", Groups.ADMINS_GROUP_UUID],
      },
    };

    const userOrErr = await service.getUser(authCtx, Users.ROOT_USER_EMAIL);

    expect(userOrErr.value, errToMsg(userOrErr.value)).toBeTruthy();
    expect(userOrErr.right.email).toBe(Users.ROOT_USER_EMAIL);
  });

  test("should return builtin user anonymous", async () => {
    const service = usersGroupsService();

    const authCtx: AuthenticationContext = {
      mode: "Direct",
      tenant: "default",
      principal: {
        email: Users.ANONYMOUS_USER_EMAIL,
        groups: [Groups.ANONYMOUS_GROUP_UUID],
      },
    };

    const userOrErr = await service.getUser(
      authCtx,
      Users.ANONYMOUS_USER_EMAIL,
    );

    expect(userOrErr.value, errToMsg(userOrErr.value)).toBeTruthy();
    expect(userOrErr.right.email).toBe(Users.ANONYMOUS_USER_EMAIL);
  });

  test("should return user if autenticated user is an admin", async () => {
    const service = usersGroupsService();

    const authCtx: AuthenticationContext = {
      mode: "Direct",
      tenant: "default",
      principal: {
        email: "stevy@gmail.com",
        groups: ["--users--", Groups.ADMINS_GROUP_UUID],
      },
    };

    await service.createUser(authCtx, {
      name: "The title",
      email: "steven@gmail.com",
      groups: ["--admins--", "--users--"],
    });

    const userOrErr = await service.getUser(authCtx, "steven@gmail.com");

    expect(userOrErr.value, errToMsg(userOrErr.value)).toBeTruthy();
    expect(userOrErr.right.email).toBe("steven@gmail.com");
  });

  test("should return error if user is not found", async () => {
    const service = usersGroupsService();

    const userOrErr = await service.getUser(authCtx, "juddy@gmail.com");

    expect(userOrErr.isLeft()).toBeTruthy();
    expect(userOrErr.value).toBeInstanceOf(UserNotFoundError);
  });
});

describe("UsersGroupsService.getGroup", () => {
  test("should return group from repository", async () => {
    const service = usersGroupsService();

    await service.createGroup(authCtx, {
      uuid: "gp-uuid",
      title: "The title",
    });

    const groupOrErr = await service.getGroup("gp-uuid");

    expect(groupOrErr.value, errToMsg(groupOrErr.value)).toBeTruthy();
    expect(groupOrErr.right.owner).toBe(authCtx.principal.email);
    expect(groupOrErr.right.mimetype).toBe(Nodes.GROUP_MIMETYPE);
  });

  test("should return builtin admins group", async () => {
    const service = usersGroupsService();

    const groupOrErr = await service.getGroup(Groups.ADMINS_GROUP_UUID);

    expect(groupOrErr.isRight(), errToMsg(groupOrErr.value)).toBeTruthy();
    expect(groupOrErr.right.uuid).toBe(Groups.ADMINS_GROUP_UUID);
    expect(groupOrErr.right.title).toBe("Admins");
    expect(groupOrErr.right.description).toBe("Admins");
  });

  test("should return error if group is not found", async () => {
    const service = usersGroupsService();

    const groupOrErr = await service.getGroup("--any group uuid--");

    expect(groupOrErr.isLeft(), errToMsg(groupOrErr.value)).toBeTruthy();
    expect(groupOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("should return error if node is not group", async () => {
    const service = usersGroupsService();

    const groupOrErr = await service.getGroup("doily-uuid");

    expect(groupOrErr.isLeft(), errToMsg(groupOrErr.value)).toBeTruthy();
    expect(groupOrErr.value).toBeInstanceOf(GroupNotFoundError);
  });
});

const userNode: UserNode = UserNode.create({
  title: "The title",
  owner: "root@gmail.com",
  uuid: "doily-uuid",
  email: "doily@gmail.com",
  group: "--admins--",
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

const repository = new InMemoryNodeRepository();
repository.add(firstGoupNode);
repository.add(secondGoupNode);
repository.add(userNode);

const authCtx: AuthenticationContext = {
  mode: "Direct",
  tenant: "default",
  principal: {
    email: "user@dmain.com",
    groups: ["group1", Groups.ADMINS_GROUP_UUID],
  },
};

const usersGroupsService = (
  opts: Partial<UsersGroupsContext> = { repository },
) =>
  new UsersGroupsService({
    storage: opts.storage ?? new InMemoryStorageProvider(),
    repository: opts.repository ?? new InMemoryNodeRepository(),
    bus: opts.bus ?? new InMemoryEventBus(),
  });

const errToMsg = (
  err: any,
) => (err.message ? err.message : JSON.stringify(err));
