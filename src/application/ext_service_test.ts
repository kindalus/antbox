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
import { ExtService } from "application/ext_service.ts";
import { NodeService } from "application/node_service.ts";

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
  return new ExtService({ repository, storage, bus: eventBus, nodeService });
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

describe("ExtService", () => {
  test("createOrReplace should create a new ext node", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    const extOrErr = await service.createOrReplace(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

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

    const extOrErr = await service.createOrReplace(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

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
      await service.createOrReplace(adminAuthContext, file, {
        uuid: "--ext-uuid--",
        title: "Title",
        description: "Description",
      })
    ).right;

    const updatedFile = new File(["content a bit longer"], "test.ext", {
      type: "application/javascript",
    });

    const extOrErr = await service.createOrReplace(
      adminAuthContext,
      updatedFile,
      {
        uuid: "--ext-uuid--",
        title: "Updated Title",
        description: "Updated Description",
      }
    );

    expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.right.size).toBe(updatedFile.size);
    expect(extOrErr.right.description).toBe("Updated Description");
  });

  test("get should return the ext node", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    await service.createOrReplace(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    const extOrErr = await service.get("--ext-uuid--");

    expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.right.uuid).toBe("--ext-uuid--");
    expect(extOrErr.right.title).toBe("Title");
    expect(extOrErr.right.size).toBe(file.size);
  });

  test("get should return an error if the ext node not found", async () => {
    const service = createService();

    const extOrErr = await service.get("--any-ext-uuid--");

    expect(extOrErr.isLeft()).toBeTruthy();
    expect(extOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("get should return error if found node is not an ext", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });
    await service.createOrReplace(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    const extOrErr = await service.get("--group-uuid--");

    expect(extOrErr.isLeft(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("update should update the ext node", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    await service.createOrReplace(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    const updatedExtOrErr = await service.update(
      adminAuthContext,
      "--ext-uuid--",
      {
        title: "Updated Title",
        description: "Updated Description",
      }
    );
    expect(
      updatedExtOrErr.isRight(),
      errMsg(updatedExtOrErr.value)
    ).toBeTruthy();

    const extOrErr = await service.get("--ext-uuid--");
    expect(extOrErr.isRight(), errMsg(extOrErr.value)).toBeTruthy();
    expect(extOrErr.right.uuid).toBe("--ext-uuid--");
    expect(extOrErr.right.title).toBe("Updated Title");
    expect(extOrErr.right.description).toBe("Updated Description");
  });

  test("delete should remove the ext node", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    await service.createOrReplace(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    const deleteOrErr = await service.delete(adminAuthContext, "--ext-uuid--");
    expect(deleteOrErr.isRight(), errMsg(deleteOrErr.value)).toBeTruthy();

    const extOrErr = await service.get("--ext-uuid--");
    expect(extOrErr.isLeft()).toBeTruthy();
    expect(extOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("list should return all ext nodes", async () => {
    const service = createService();
    const firstFile = new File(["content"], "test1.ext", {
      type: "application/javascript",
    });
    const secondFile = new File(["content"], "test2.ext", {
      type: "application/javascript",
    });

    await service.createOrReplace(adminAuthContext, firstFile, {
      uuid: "--ext-uuid-1--",
      title: "Title 1",
      description: "Description 1",
    });

    await service.createOrReplace(adminAuthContext, secondFile, {
      uuid: "--ext-uuid-2--",
      title: "Title 2",
      description: "Description 2",
    });

    const exts = await service.list();
    expect(exts.right.length).toBe(2);
  });

  test("export should return the ext file in 'Javascript' format", async () => {
    const service = createService();
    const file = new File(["content"], "test.ext", {
      type: "application/javascript",
    });

    await service.createOrReplace(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    const extOrErr = await service.export("--ext-uuid--");
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
      }
    );
    const request = new Request("http://example.com");

    await service.createOrReplace(adminAuthContext, file, {
      uuid: "--ext-uuid--",
      title: "Title",
      description: "Description",
    });

    const responseOrErr = await service.run("--ext-uuid--", request);
    expect(responseOrErr.isRight(), errMsg(responseOrErr.value)).toBeTruthy();
    expect(responseOrErr.right.status).toBe(200);
  });
});
