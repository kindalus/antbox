import { describe, test, expect } from "bun:test"
import { UsersGroupsService } from "./users_groups_service"
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider"
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository"
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus"
import type { UsersGroupsContext } from "./users_groups_service_context"
import { ValidationError } from "shared/validation_error"
import { UserExistsError } from "domain/users_groups/user_exists_error"
import GroupNotFoundError from "domain/users_groups/group_not_found_error"
import { Groups } from "domain/users_groups/groups"
import { Users } from "domain/users_groups/users"
import { Nodes } from "domain/nodes/nodes"
import { UserNode } from "domain/users_groups/user_node"
import { Folders } from "domain/nodes/folders"
import { GroupNode } from "domain/users_groups/group_node"
import { UsernameAlreadyExists } from "domain/users_groups/user_username_already_exists"

describe("UsersGroupsService.createUser", () => {
    test("should create user and persist the metadata", async () => {
      const service = usersGroupsService();

      await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--the uuid--",
        email: "joane@gmail.com",
        username: "joanedoe",
        groups: ["--admins--","--users--"],
      });

      const userOrErr = await service.getUser("--the uuid--");

      expect(userOrErr.isRight(), errToMsg(userOrErr.value)).toBeTruthy();
      expect(userOrErr.right.title).toBe("The title");
      expect(userOrErr.right.owner).toBe("root@gmail.com");
      expect(userOrErr.right.username).toBe("joanedoe");
    });

    test("should remove duplicated groups", async () => {
      const service = usersGroupsService();

      await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--parent--",
        username: "duck",
        email: "duck@gmail.com",
        groups: ["--admins--", "--admins--","--users--", "--ultimate--"],
      });

      const userOrErr = await service.getUser("--parent--");

      expect(userOrErr.isRight(), errToMsg(userOrErr.value)).toBeTruthy();
      expect(userOrErr.right.username).toBe("duck");
      expect(userOrErr.right.group).toBe("--admins--");
      expect(userOrErr.right.groups).toEqual(["--users--", "--ultimate--"]);
    });

    test("should return error if user already exists", async () => {
      const service = usersGroupsService();

      await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--parent--",
        username: "larathomas",
        email: "tyrion@gmail.com",
        groups: ["--admins--","--users--"],
      });

      const userOrErr = await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--parent--",
        username: "larathomas",
        email: "tyrion@gmail.com",
        groups: ["--admins--","--users--"],
      });

      expect(userOrErr.isLeft(), errToMsg(userOrErr.value)).toBeTruthy();
      expect(userOrErr.value).toBeInstanceOf(ValidationError);
      expect((userOrErr.value as ValidationError).errors[0]).toBeInstanceOf(UserExistsError);
    });

    test("should return error if user groups is invalid", async () => {
      const service = usersGroupsService();

      const userOrErr = await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--root--",
        username: "kyle",
        email: "kyle@gmail.com",
        groups: ["--any group--", "--another any group--"]
      });

      expect(userOrErr.isLeft(), errToMsg(userOrErr.value)).toBeTruthy();
      expect(userOrErr.value).toBeInstanceOf(ValidationError);
      expect((userOrErr.value as ValidationError).errors[0]).toBeInstanceOf(GroupNotFoundError);
    });

    test("should return error if user 'Username' already exists", async () => {
      const service = usersGroupsService();

      await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--goodx--",
        username: "tyrionkrull",
        email: "krull@gmail.com",
        groups: ["--ultimate--","--users--"],
      });

      const userOrErr = await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--good--",
        username: "tyrionkrull",
        email: "kroyle@gmail.com",
        groups: ["--ultimate--","--users--"],
      });

      expect(userOrErr.isLeft(), errToMsg(userOrErr.value)).toBeTruthy();
      expect(userOrErr.value).toBeInstanceOf(ValidationError);
      expect((userOrErr.value as ValidationError).errors[0]).toBeInstanceOf(UsernameAlreadyExists);
    });
});

describe("UsersGroupsService.createGroup",  () => {
  test("should create group and persist metadata", async () => {
    const service = usersGroupsService();

    await service.createGroup(
      {
        title: "The Title",
        owner: "user@gmail.com",
        uuid: "--group-uuid--",
        mimetype: Nodes.GROUP_MIMETYPE,
      }
    );

    const groupOrErr = await service.getGroup("--group-uuid--");

    expect(groupOrErr.isRight(), errToMsg(groupOrErr.value)).toBeTruthy();
    expect(groupOrErr.right.mimetype).toBe(Nodes.GROUP_MIMETYPE);
    expect(groupOrErr.right.parent).toBe(Folders.GROUPS_FOLDER_UUID);
  });
});
  
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
repository.add(firstGoupNode);
repository.add(secondGoupNode);
repository.add(thirdGoupNode);

const usersGroupsService = (opts: Partial<UsersGroupsContext> = { repository: repository }) =>
  new UsersGroupsService({
    storage: opts.storage ?? new InMemoryStorageProvider(),
    repository: opts.repository ?? new InMemoryNodeRepository(),
    bus: opts.bus ?? new InMemoryEventBus(),
});

const errToMsg = (err: any) => (err.message ? err.message : JSON.stringify(err))
