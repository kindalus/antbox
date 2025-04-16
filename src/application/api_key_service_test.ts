import { expect } from "expect/expect";
import { describe, test } from "bdd";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { ApiKeyNode } from "domain/api_keys/api_key_node.ts";
import { ApiKeyNodeFoundError } from "domain/api_keys/api_key_node_found_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { ApiKeyService } from "application/api_key_service.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";
import { Users } from "domain/users_groups/users.ts";

export const errToMsg = (err: any): string => {
  if (err instanceof Error) {
    return err.message;
  }

  return JSON.stringify(err);
};

const createService = (repository = new InMemoryNodeRepository()) => {
  const groupNode: GroupNode = GroupNode.create({
    uuid: "api-group",
    title: "API Group",
    owner: "owner@example.com",
    mimetype: Nodes.API_KEY_MIMETYPE,
  }).right;

  repository.add(groupNode);

  const storage = new InMemoryStorageProvider();
  const eventbus = new InMemoryEventBus();
  const nodeService = new NodeService({ repository, storage, bus: eventbus });

  return new ApiKeyService(nodeService);
};

const authContext: AuthenticationContext = {
  mode: "Direct",
  tenant: "default",
  principal: {
    email: "owner@example.com",
    groups: [Groups.ADMINS_GROUP_UUID],
  },
};

describe("ApiKeyService", () => {
  test("create should create an API key", async () => {
    const service = createService();

    const apiKeyOrErr = await service.create(authContext, "api-group");

    expect(apiKeyOrErr.isRight(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
    expect(apiKeyOrErr.right.group).toBe("api-group");
  });

  test("create should return error if group does not exists", async () => {
    const service = createService();

    const apiKeyOrErr = await service.create(authContext, "non-existing-group");

    expect(apiKeyOrErr.isLeft()).toBeTruthy();
    expect(apiKeyOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("get should return the API key", async () => {
    const node = ApiKeyNode.create({
      title: "Test API Key",
      secret: "api-key-secret",
      group: "some-api-group",
      owner: Users.ROOT_USER_EMAIL,
    }).right;

    const repo = new InMemoryNodeRepository();
    repo.add(node);

    const service = createService(repo);

    const apiKeyOrErr = await service.get(node.uuid);

    expect(apiKeyOrErr.isRight(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
    expect(apiKeyOrErr.right.group).toBe("some-api-group");
  });

  test("get should return error if node not found", async () => {
    const service = createService();

    const apiKeyOrErr = await service.get("--non-existing-uuid--");

    expect(apiKeyOrErr.isLeft(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
    expect(apiKeyOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("get should return error if node found is not API key node ", async () => {
    const service = createService();

    const apiKeyOrErr = await service.get("api-group");

    expect(apiKeyOrErr.isLeft(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
    expect(apiKeyOrErr.value).toBeInstanceOf(ApiKeyNodeFoundError);
  });

  test("getBySecret should return the API key", async () => {
    const repo = new InMemoryNodeRepository();
    repo.add(
      ApiKeyNode.create({
        uuid: "api-key-uuid",
        title: "Test API Key",
        secret: "api-key-secret",
        group: "api-group",
        owner: Users.ROOT_USER_EMAIL,
      }).right,
    );
    const service = createService(repo);

    const dto = await service.getBySecret("api-key-secret");

    expect(dto.isRight(), errToMsg(dto.value)).toBeTruthy();
    expect(dto.right.group).toBe("api-group");
  });

  test("getBySecret should return error if node not found", async () => {
    const service = createService();

    const apiKeyOrErr = await service.getBySecret("--any-secret--");

    expect(apiKeyOrErr.isLeft(), errToMsg(apiKeyOrErr.value)).toBeTruthy();
    expect(apiKeyOrErr.value).toBeInstanceOf(ApiKeyNodeFoundError);
  });

  test("list should return all Api Keys", async () => {
    const service = createService();

    (await service.create(authContext, Groups.ANONYMOUS_GROUP_UUID)).right;
    (await service.create(authContext, Groups.ADMINS_GROUP_UUID)).right;

    const apiKeys = await service.list(authContext);
    expect(apiKeys.length).toBe(2);

    expect(
      apiKeys.some((apiKey) => apiKey.group === Groups.ANONYMOUS_GROUP_UUID),
    )
      .toBeTruthy();
    expect(apiKeys.some((apiKey) => apiKey.group === Groups.ADMINS_GROUP_UUID))
      .toBeTruthy();
  });

  test("delete should remove the api key", async () => {
    const repo = new InMemoryNodeRepository();

    repo.add(
      ApiKeyNode.create({
        uuid: "api-key-uuid",
        title: "Test API Key",
        secret: "api-key-secret",
        group: "api-group",
        owner: Users.ROOT_USER_EMAIL,
      }).right,
    );

    const service = createService(repo);

    const voidOrErr = await service.delete(authContext, "api-key-uuid");

    expect(voidOrErr.isRight(), errToMsg(voidOrErr.value)).toBeTruthy();
    expect((await repo.getById("api-key-uuid")).isLeft()).toBeTruthy();
  });

  test("delete should return error if api key not exists", async () => {
    const service = createService();

    const voidOrErr = await service.delete(authContext, "--any-uuid--");

    expect(voidOrErr.isLeft(), errToMsg(voidOrErr.value)).toBeTruthy();
  });
});
