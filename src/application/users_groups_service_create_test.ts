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
import { GroupNode } from "domain/users_groups/group_node"
import { Nodes } from "domain/nodes/nodes"
import { UserNode } from "domain/users_groups/user_node"
import { Folders } from "domain/nodes/folders"

describe("UsersGroupsService.createUser", () => {
    test("should create user and persist the metadata", async () => {
      const service = usersGroupsService({repository: new InMemoryNodeRepository()});

      await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--parent--",
        name: "Tyrion Krull",
        email: "tyrion@gmail.com",
        username: "tyrionkrull",
        group: Groups.ADMINS_GROUP_UUID,
      });

      const userOrErr = await service.getUser("--parent--");

      expect(userOrErr.isRight(), errToMsg(userOrErr.value)).toBeTruthy();
      expect(userOrErr.right.uuid).toBe("--parent--");
      expect(userOrErr.right.title).toBe("The title");
      expect(userOrErr.right.owner).toBe("root@gmail.com");
      expect(userOrErr.right.username).toBe("tyrionkrull");
    });

    test("should remove duplicated groups", async () => {
      const service = usersGroupsService();

      await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--parent--",
        name: "Tyrion Krull",
        username: "tyrionkrull",
        email: "tyrion@gmail.com",
        group: Groups.ADMINS_GROUP_UUID,
        groups: ["--admins--", "--admins--","--users--"],
      });

      const userOrErr = await service.getUser("--parent--");

      expect(userOrErr.isRight(), errToMsg(userOrErr.value)).toBeTruthy();
      expect(userOrErr.right.uuid).toBe("--parent--");
      expect(userOrErr.right.groups).toEqual(["--admins--", "--users--"]);
    });

    test("should return error if user already exists", async () => {
      const service = usersGroupsService();

      await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--parent--",
        name: "Tyrion Krull",
        username: "tyrionkrull",
        email: "tyrion@gmail.com",
        group: Groups.ADMINS_GROUP_UUID,
      });

      const userOrErr = await service.createUser({
        title: "The title",
        owner: "root@gmail.com",
        uuid: "--parent--",
        name: "Tyrion Krull",
        username: "tyrionkrull",
        email: "tyrion@gmail.com",
        group: Groups.ADMINS_GROUP_UUID,
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
        name: "Tyrion Krull",
        username: "tyrionkrull",
        email: "tyrion@gmail.com",
        group: Groups.ADMINS_GROUP_UUID,
        groups: ["--any group--", "--another any group--"]
      });

      expect(userOrErr.isLeft(), errToMsg(userOrErr.value)).toBeTruthy();
      expect(userOrErr.value).toBeInstanceOf(ValidationError);
      expect((userOrErr.value as ValidationError).errors[0]).toBeInstanceOf(GroupNotFoundError);
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

const groupNode: GroupNode = GroupNode.create({
  uuid: Groups.ADMINS_GROUP_UUID,
  fid: Groups.ADMINS_GROUP_UUID,
  title: "Admins",
  description: "Admins",
  owner: Users.ROOT_USER_EMAIL,
  group: Groups.ADMINS_GROUP_UUID,
}).right;

const userNode: UserNode = UserNode.create({
  uuid: "--users--",
  fid: Groups.ADMINS_GROUP_UUID,
  title: "The title",
  description: "Admins",
  owner: Users.ROOT_USER_EMAIL,
  group: Groups.ADMINS_GROUP_UUID,
}).right;

const repository = new InMemoryNodeRepository();
repository.add(groupNode);
repository.add(userNode);
  
const usersGroupsService = (opts: Partial<UsersGroupsContext> = {repository: repository}) =>
  new UsersGroupsService({
    storage: opts.storage ?? new InMemoryStorageProvider(),
    repository: opts.repository ?? new InMemoryNodeRepository(),
    bus: opts.bus ?? new InMemoryEventBus(),
});

const errToMsg = (err: any) => (err.message ? err.message : JSON.stringify(err))
