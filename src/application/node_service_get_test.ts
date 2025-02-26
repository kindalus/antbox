import { describe, test, expect } from "bun:test";

import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { FileNode } from "domain/nodes/file_node";
import { NodeService } from "./node_service";
import type { AuthenticationContext } from "./authentication_context";
import { Groups } from "domain/auth/groups";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import { Users } from "domain/auth/users";
import { ForbiddenError } from "shared/antbox_error";
import { FolderNode } from "domain/nodes/folder_node";
import { Folders } from "domain/nodes/folders";
import { Nodes } from "domain/nodes/nodes";
import { MetaNode } from "domain/nodes/meta_node";
import { NodeTypeError } from "domain/nodes/node_type_error";
import { NodeFileNotFoundError } from "domain/nodes/node_file_not_found_error";

describe("NodeService.get", () => {
  test("should return node information from repository", async () => {
    const node = FileNode.create({
      uuid: "uuid",
      title: "title",
      mimetype: "application/pdf",
      size: 123,
      parent: Folders.ROOT_FOLDER_UUID,
      owner: "owner@antbox.io",
    }).right;

    const repository = new InMemoryNodeRepository();
    await repository.add(node);

    const service = new NodeService({ storage: new InMemoryStorageProvider(), repository });

    const nodeOrErr = await service.get(authCtx, node.uuid);

    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.right).toEqual(node);
  });

  test("should return if uuid is in fid format", async() =>{
    const service = nodeService();
    await service.create(authCtx, {title: "Folder 1", fid: "fid-1", mimetype: Nodes.FOLDER_MIMETYPE});

    const nodeOrErr = await service.get(authCtx, "--fid--fid-1");
    expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
    expect(nodeOrErr.right.title).toEqual("Folder 1");
    expect(nodeOrErr.right.mimetype).toEqual(Nodes.FOLDER_MIMETYPE);
  })

  test("should return error if node is not found", async () => {
    const repository = new InMemoryNodeRepository();
    const service = new NodeService({ storage: new InMemoryStorageProvider(), repository });

    const nodeOrErr = await service.get(authCtx, "not-found");

    expect(nodeOrErr.isRight()).toBeFalsy();
    expect(nodeOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("should return a error if user doen't have 'Read' permission on parent", async () => {
    const parent = FolderNode.create({
      uuid: "parent",
      title: "title",
      parent: "root",
      owner: Users.ROOT_USER_EMAIL,
      group: Groups.ADMINS_GROUP_UUID,
      permissions: {
        anonymous: [],
        group: ["Read"],
        authenticated: [],
        advanced: {},
      },
    }).right;

    const node = FileNode.create({
      uuid: "uuid",
      title: "title",
      mimetype: "application/pdf",
      size: 123,
      parent: "parent",
      owner: Users.ROOT_USER_EMAIL,
    }).right;

    const authCtx: AuthenticationContext = {
      mode: "Direct",
      tenant: "default",
      principal: {
        email: "someemail@gmail.com",
        groups: ["group1"],
      },
    };

    const repository = new InMemoryNodeRepository();
    await repository.add(parent);
    await repository.add(node);

    const service = new NodeService({ storage: new InMemoryStorageProvider(), repository });

    const nodeOrErr = await service.get(authCtx, node.uuid);

    expect(nodeOrErr.isRight()).toBeFalsy();
    expect(nodeOrErr.value).toBeInstanceOf(ForbiddenError);
  });
});

describe("NodeService.export", () => {
  test("should return the file", async () => {
    const service = nodeService();
    await service.create(authCtx, {
      uuid: "parent-uuid",
      title: "Documents",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    await service.createFile(authCtx, file, { uuid: "file-uuid", parent: "parent-uuid" });

    const fileOrErr = await service.export(authCtx, "file-uuid");

    expect(fileOrErr.isRight(), errToMsg(fileOrErr.value)).toBeTruthy();
    expect(fileOrErr.right.size).toEqual(file.size);
    expect(fileOrErr.right.type).toEqual(file.type);
  });

  test("should return error if file is not found", async () => {
    const service = nodeService();
    const fileOrErr = await service.export(authCtx, "not-found");

    expect(fileOrErr.isRight()).toBeFalsy();
    expect(fileOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("should return error if user doesn't have 'Export' permission on parent", async () => {
    const service = nodeService();
    await service.create(authCtx, {
      uuid: "parent-uuid",
      title: "Documents",
      mimetype: Nodes.FOLDER_MIMETYPE,
      permissions: {
        anonymous: [],
        group: ["Read"],
        authenticated: ["Read"],
        advanced: {},
      },
    });

    await service.createFile(authCtx, file, { uuid: "file-uuid", parent: "parent-uuid" });
    const fileOrErr = await service.export(
      {
        mode: "Direct",
        tenant: "",
        principal: { email: "otheruser@email.com", groups: ["XXXXX"] },
      },
      "file-uuid",
    );
    expect(fileOrErr.isRight()).toBeFalsy();
    expect(fileOrErr.value).toBeInstanceOf(ForbiddenError);
  });

  test("should return an error if node is not a file", async () => {
    const repository = new InMemoryNodeRepository();
    const service = new NodeService({ storage: new InMemoryStorageProvider(), repository });

    await service.create(authCtx, {
      uuid: "puuid",
      title: "Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });
    (
      await service.create(authCtx, {
        uuid: "nuuid",
        title: "Meta",
        parent: "puuid",
        mimetype: Nodes.META_NODE_MIMETYPE,
      }),
    ).right;
    const fileOrErr = await service.export(authCtx, "nuuid");

    expect(fileOrErr.isRight()).toBeFalsy();
    expect(fileOrErr.value).toBeInstanceOf(NodeFileNotFoundError);
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

const errToMsg = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message;
  }
  return JSON.stringify(err, null, 2);
};

const nodeService = () =>
  new NodeService({
    storage: new InMemoryStorageProvider(),
    repository: new InMemoryNodeRepository(),
  });

const file = new File(["xxxxxxx"], "file.pdf", { type: "application/pdf" });
