import { expect } from "expect/expect";
import { describe, test } from "bdd";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { GroupNode } from "domain/users_groups/group_node.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { FeatureService } from "application/feature_service.ts";
import { NodeService } from "application/node_service.ts";
import { UsersGroupsService } from "application/users_groups_service.ts";

const createService = (repository = new InMemoryNodeRepository()) => {
  const groupNode: GroupNode = GroupNode.create({
    uuid: "--group-uuid--",
    title: "Group",
    description: "Group description",
    owner: "root@example.com",
  }).right;

  repository.add(groupNode);

  const storage = new InMemoryStorageProvider();
  const eventBus = new InMemoryEventBus();
  const nodeService = new NodeService({ repository, storage, bus: eventBus });
  const usersGroupsService = new UsersGroupsService({
    repository,
    storage,
    bus: eventBus,
  });
  return new FeatureService(nodeService, usersGroupsService);
};

const adminAuthContext: AuthenticationContext = {
  mode: "Direct",
  tenant: "default",
  principal: {
    email: "admin@example.com",
    groups: [Groups.ADMINS_GROUP_UUID],
  },
};

const errMsg = (err: any) => {
  if (err instanceof Error) {
    return err.message;
  }
  return JSON.stringify(err);
};

describe("FeatureService", () => {
  test("createOrReplace should create a new ext node", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    const extOrErr = await service.createOrReplaceExtension(
      adminAuthContext,
      file,
      {
        uuid: "--ext-uuid--",
        title: "Title",
        description: "Description",
      },
    );

    expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.right.uuid).toBe("--ext-uuid--");
    expect(extOrErr.right.title).toBe("Title");
    expect(extOrErr.right.description).toBe("Description");
  });

  test("createOrReplace should return an error if the file mimetype is invalid", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/pdf",
    });

    const extOrErr = await service.createOrReplaceExtension(
      adminAuthContext,
      file,
      {
        uuid: "--ext-uuid--",
        title: "Title",
        description: "Description",
      },
    );

    expect(extOrErr.isLeft()).toBeTruthy();
    expect(extOrErr.value).toBeInstanceOf(BadRequestError);
  });

  test("createOrReplace should replace an existing ext node", async () => {
    const repository = new InMemoryNodeRepository();
    const service = createService(repository);

    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    (
      await service.createOrReplaceExtension(adminAuthContext, file, {
        uuid: "--ext-uuid--",
        title: "Title",
        description: "Description",
      })
    ).right;

    const updatedFile = new File(["content a bit longer"], "test.ext", {
      type: "application/javascript",
    });

    const extOrErr = await service.createOrReplaceExtension(
      adminAuthContext,
      updatedFile,
      {
        uuid: "ext-uuid",
        title: "New Ext",
        description: "Updated Description",
      },
    );

    expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.right.title).toBe("New Ext");
    expect(extOrErr.right.description).toBe("Updated Description");
  });

  test("get should return the ext node", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    await service.createOrReplaceExtension(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    const extOrErr = await service.getExtension(
      "--ext-uuid--",
      adminAuthContext,
    );

    expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.right.uuid).toBe("--ext-uuid--");
    expect(extOrErr.right.title).toBe("Title");
    expect(extOrErr.right.size).toBe(file.size);
  });

  test("get should return an error if the ext node not found", async () => {
    const service = createService();

    const extOrErr = await service.getExtension(
      "--not-found--",
      adminAuthContext,
    );

    expect(extOrErr.isLeft()).toBeTruthy();
    expect(extOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("get should return error if found node is not an ext", async () => {
    const service = createService();

    const extOrErr = await service.getExtension(
      "--group-uuid--",
      adminAuthContext,
    );

    expect(extOrErr.isLeft(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("update should update the ext node", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    const createResult = await service.createOrReplaceExtension(
      adminAuthContext,
      file,
      {
        uuid: "--ext-uuid--",
        title: "Title",
        description: "Description",
      },
    );
    expect(createResult.isRight(), errMsg(createResult.value)).toBeTruthy();

    const updatedExtOrErr = await service.updateExtension(
      adminAuthContext,
      "--ext-uuid--",
      {
        title: "New Title",
        description: "New Description",
      },
    );
    expect(
      updatedExtOrErr.isRight(),
      errMsg(updatedExtOrErr.value),
    ).toBeTruthy();

    const extOrErr = await service.getExtension(
      "--ext-uuid--",
      adminAuthContext,
    );
    expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.right.uuid).toBe("--ext-uuid--");
    expect(extOrErr.right.title).toBe("New Title");
    expect(extOrErr.right.description).toBe("New Description");
  });

  test("delete should remove the ext node", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    await service.createOrReplaceExtension(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    const deleteResult = await service.deleteExtension(
      adminAuthContext,
      "--ext-uuid--",
    );

    expect(deleteResult.isRight(), errMsg(deleteResult.value)).toBeTruthy();

    const extOrErr = await service.getExtension(
      "--ext-uuid--",
      adminAuthContext,
    );
    expect(extOrErr.isLeft()).toBeTruthy();
    expect(extOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("list should return all ext nodes", async () => {
    const service = createService();
    const firstFile = new File(["content"], "test1.ext", {
      type: "application/javascript",
    });
    const secondFile = new File(["content2"], "test2.ext", {
      type: "application/javascript",
    });

    await service.createOrReplaceExtension(adminAuthContext, firstFile, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    await service.createOrReplaceExtension(adminAuthContext, secondFile, {
      uuid: "--ext-uuid2--",
      title: "Title 2",
      description: "Description 2",
    });

    const result = await service.listExtensions();
    expect(result.isRight()).toBeTruthy();
    expect(result.right.length).toBe(2);
  });

  test("export should return the ext file in 'Javascript' format", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    await service.createOrReplaceExtension(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    const extOrErr = await service.exportExtension("--ext-uuid--");
    expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.right.name).toBe("Title");
  });

  test("run should execute the ext function", async () => {
    const service = createService();
    const file = new File(
      [
        "export default (request) => { return { status: 200, body: 'Hello World' } }",
      ],
      "test.ext",
      {
        type: "application/javascript",
      },
    );
    const request = new Request("http://example.com");

    await service.createOrReplaceExtension(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Test Extension",
      description: "Test Description",
    });

    const responseOrErr = await service.runExtension("--ext-uuid--", request);
    expect(responseOrErr.isRight(), errMsg(responseOrErr.value)).toBeTruthy();
    expect(responseOrErr.right.status).toBe(200);
  });
});
