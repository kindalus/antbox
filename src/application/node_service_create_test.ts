import { test, expect, describe } from "bun:test";
import { NodeService } from "./node_service";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import type { AuthenticationContext } from "./authentication_context";
import { FolderNode } from "domain/nodes/folder_node";
import type { FileLikeNode } from "domain/nodes/node_like";
import { Folders } from "domain/nodes/folders";
import { BadRequestError } from "shared/antbox_error";
import { ADMINS_GROUP } from "./builtin_groups";
import { Nodes } from "domain/nodes/nodes";
import { Groups } from "domain/auth/groups";
import type { Permissions } from "domain/nodes/node";

describe("NodeService.create", () => {
  test("should create a node and persist the metadata", async () => {
    const service = nodeService();

    await service.create(authCtx, {
      uuid: "--parent--",
      title: "Folder 1",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    await service.create(authCtx, {
      uuid: "--child--",
      title: "Node 1",
      mimetype: Nodes.META_NODE_MIMETYPE,
      parent: "--parent--",
    });

    const nodeOrErr = await service.get(authCtx, "--child--");

    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.right.title).toBe("Node 1");
    expect(nodeOrErr.right.parent).toBe("--parent--");
    expect(nodeOrErr.right.mimetype).toBe(Nodes.META_NODE_MIMETYPE);
  });

  test("use context principal email and first group as folder owner and group", async () => {
    const service = nodeService();
    const ctx = {
      mode: "Direct",
      tenant: "",
      principal: {
        email: "otheremail@domain.com",
        groups: ["some-group", Groups.ADMINS_GROUP_UUID],
      },
    } as AuthenticationContext;

    const nodeOrErr = await service.create(ctx, {
      title: "Some Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.right.owner).toBe(ctx.principal.email);
    expect((nodeOrErr.right as FolderNode).group).toBe(ctx.principal.groups[0]);
  });

  test("should use give permissions", async () => {
    const permissions: Permissions = {
      anonymous: [],
      group: ["Read", "Export"],
      authenticated: ["Read"],
      advanced: {},
    };

    const service = nodeService();
    const node = await service.create(authCtx, {
      title: "Folder 1",
      mimetype: Nodes.FOLDER_MIMETYPE,
      permissions,
    });

    expect((node.right as FolderNode).permissions).toEqual(permissions);
  });

  test("should have the same permissions (folder) as parent's if no permissions given", async () => {
    const permissions: Permissions = {
      anonymous: ["Read"],
      group: ["Read", "Write"],
      authenticated: ["Read"],
      advanced: {
        "some-group": ["Read"],
      },
    };

    const service = nodeService();
    await service.create(authCtx, {
      uuid: "--parent--",
      title: "Parent Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
      permissions,
    });

    const node = await service.create(authCtx, {
      title: "Folder 2",
      mimetype: Nodes.FOLDER_MIMETYPE,
      parent: "--parent--",
    });

    expect((node.right as FolderNode).permissions).toEqual(permissions);
  });

  test("should use title to generate fid if not given", async () => {
    const service = nodeService();

    const nodeOrErr = await service.create(authCtx, {
      title: "Unique Title",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.right.fid).toBeDefined();
    expect(nodeOrErr.right.fid).toBe("unique-title");
  });

  test("should store in root folder if no parent given", async () => {
    const nodeOrErr = await nodeService().create(authCtx, {
      title: "Folder 1",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.right.parent).toBe(Folders.ROOT_FOLDER_UUID);
  });

  test("should convey to folder children restritions", async () => {
    const nodeOrErr = await nodeService().createFile(authCtx, dummyFile, {
      parent: Folders.ROOT_FOLDER_UUID,
    });

    expect(nodeOrErr.isLeft(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.value).toBeInstanceOf(BadRequestError);
  });
});

describe("NodeService.createFile", () => {
  test("should create a file and persist the metadata", async () => {
    const repository = new InMemoryNodeRepository();
    const nodeService = new NodeService({
      storage: new InMemoryStorageProvider(),
      repository,
    });

    repository.add(
      FolderNode.create({
        uuid: "--parent--",
        title: "Folder",
        owner: "user@domain.com",
        group: "group@domain.com",
      }).right,
    );

    const file = new File(["<html><body>Ola</body></html>"], "index.html", {
      type: "text/html",
    });
    const nodeOrErr = await nodeService.createFile(authCtx, file, {
      parent: "--parent--",
    });

    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();

    const node = await nodeService
      .get(authCtx, nodeOrErr.right.uuid)
      .then((r) => r.right as FileLikeNode);

    expect(node.size).toBe(file.size);
    expect(node.mimetype).toBe(file.type);
    expect(node.title).toBe(file.name);
    expect(node.fid).toBeDefined();
  });

  test("should use filename as title if not given", async () => {
    const service = nodeService();
    await service.create(authCtx, {
      uuid: "--parent--",
      title: "Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    const nodeOrErr = await service.createFile(authCtx, dummyFile, { parent: "--parent--" });

    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.right.title).toBe(dummyFile.name);
  });

  test("should store the file", async () => {
    const storage = new InMemoryStorageProvider();
    const service = new NodeService({ storage, repository: new InMemoryNodeRepository() });

    const parent = await service.create(authCtx, {
      title: "Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    const fileNode = await service.createFile(authCtx, dummyFile, { parent: parent.right.uuid });
    const fileOrErr = await storage.read(fileNode.right.uuid);

    expect(fileOrErr.isRight()).toBeTruthy();
    expect(fileOrErr.right.size).toBe(dummyFile.size);
  });

  test("should use file mimetype", async () => {
    const service = nodeService();
    await service.create(authCtx, {
      uuid: "--parent--",
      title: "Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    const nodeOrErr = await service.createFile(authCtx, dummyFile, {
      parent: "--parent--",
      mimetype: "image/jpeg",
    });

    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.right.mimetype).toBe(dummyFile.type);
  });

  test("should use node mimetype if given action or ext mimetype", async () => {
    const service = nodeService();
    const nodeOrErr = await service.createFile(authCtx, dummyFile, {
      parent: "--parent--",
      mimetype: Nodes.EXT_MIMETYPE,
    });

    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.right.mimetype).toBe(Nodes.EXT_MIMETYPE);
  });
});

describe("NodeService.duplicate", () => {
  test("should create the same node in the same directory with diferent uuid, fid and a title with '2' as suffix", async () => {
    const service = nodeService();
    const parent = await service.create(authCtx, {
      title: "Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });
    const node = await service.create(authCtx, {
      title: "Meta File",
      mimetype: Nodes.META_NODE_MIMETYPE,
      parent: parent.right.uuid,
    });

    const duplicate = await service.duplicate(authCtx, node.right.uuid);

    expect(duplicate.isRight(), errToMsg(duplicate.value)).toBeTruthy();
    expect(duplicate.right.title).toBe("Meta File 2");
    expect(duplicate.right.uuid).not.toBe(node.right.uuid);
    expect(duplicate.right.fid).not.toBe(node.right.fid);
    expect(duplicate.right.parent).toBe(node.right.parent);
    expect(duplicate.right.mimetype).toBe(node.right.mimetype);
  });

  test("should create a copy of the file if node is a file like node", async () => {
    const service = nodeService();
    const parent = await service.create(authCtx, {
      title: "Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });
    const node = await service.createFile(authCtx, dummyFile, {
      parent: parent.right.uuid,
    });

    const duplicateOrErr = await service.duplicate(authCtx, node.right.uuid);
    const duplicatedFileOrErr = await service.export(authCtx, duplicateOrErr.right.uuid);

    expect(duplicatedFileOrErr.isRight(), errToMsg(duplicatedFileOrErr.value)).toBeTruthy();
    expect(duplicatedFileOrErr.right.size).toBe(dummyFile.size);
  });

  test("should return a error if node to duplicate is a folder node", async () => {
    const service = nodeService();
    const parent = await service.create(authCtx, {
      title: "Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });
    const folder = await service.create(authCtx, {
      title: "Folder to Duplicate",
      mimetype: Nodes.FOLDER_MIMETYPE,
      parent: parent.right.uuid,
    });

    const duplicateOrErr = await service.duplicate(authCtx, folder.right.uuid);

    expect(duplicateOrErr.isRight()).toBeFalsy();
    expect(duplicateOrErr.value).toBeInstanceOf(BadRequestError);
  });
});

describe("NodeService.copy", () => {
  test("should copy a node to a new parent folder", async () => {
    const service = nodeService();
    const parent1 = await service.create(authCtx, {
      title: "Parent Folder 1",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });
    const parent2 = await service.create(authCtx, {
      title: "Parent Folder 2",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });
    const node = await service.create(authCtx, {
      title: "Meta File",
      mimetype: Nodes.META_NODE_MIMETYPE,
      parent: parent1.right.uuid,
    });

    const copyOrErr = await service.copy(authCtx, node.right.uuid, parent2.right.uuid);

    expect(copyOrErr.isRight(), errToMsg(copyOrErr.value)).toBeTruthy();
    expect(copyOrErr.right.title).toBe("Meta File 2");
    expect(copyOrErr.right.uuid).not.toBe(node.right.uuid);
    expect(copyOrErr.right.parent).toBe(parent2.right.uuid);
    expect(copyOrErr.right.mimetype).toBe(node.right.mimetype);
  });

  test("should return error if node to copy is a folder", async () => {
    const service = nodeService();
    const parent = await service.create(authCtx, {
      title: "Parent Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });
    const folder = await service.create(authCtx, {
      title: "Folder to Copy",
      mimetype: Nodes.FOLDER_MIMETYPE,
      parent: parent.right.uuid,
    });

    const copyOrErr = await service.copy(authCtx, folder.right.uuid, parent.right.uuid);

    expect(copyOrErr.isRight()).toBeFalsy();
    expect(copyOrErr.value).toBeInstanceOf(BadRequestError);
  });

  test("should create a copy of the file if node is a file like node", async () => {
    const service = nodeService();
    const parent1 = await service.create(authCtx, {
      title: "Parent Folder 1",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });
    const parent2 = await service.create(authCtx, {
      title: "Parent Folder 2",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });
    const node = await service.createFile(authCtx, dummyFile, {
      parent: parent1.right.uuid,
    });

    const copyOrErr = await service.copy(authCtx, node.right.uuid, parent2.right.uuid);
    const copiedFileOrErr = await service.export(authCtx, copyOrErr.right.uuid);

    expect(copiedFileOrErr.isRight(), errToMsg(copiedFileOrErr.value)).toBeTruthy();
    expect(copiedFileOrErr.right.size).toBe(dummyFile.size);
  });
});
const authCtx: AuthenticationContext = {
  mode: "Direct",
  tenant: "",
  principal: {
    email: "user@example.com",
    groups: [ADMINS_GROUP.uuid, "user"],
  },
};

const errToMsg = (err: any) => (err.message ? err.message : JSON.stringify(err));

const nodeService = () =>
  new NodeService({
    storage: new InMemoryStorageProvider(),
    repository: new InMemoryNodeRepository(),
  });

const dummyFile = new File(["Ola"], "ola.txt", { type: "text/plain" });
