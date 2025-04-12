import { describe, test } from "bdd";
import { expect } from "expect";
import { NodeService } from "./node_service.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { FileNode } from "domain/nodes/file_node.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";

describe("NodeService.update", () => {
  test("should update the node metadata", async () => {
    const service = nodeService();
    const nodeOrErr = await service.create(authCtx, {
      title: "Initial Title",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
      title: "Updated Title",
      description: "Updated Description",
    });

    expect(updateOrErr.isRight(), errToMsg(updateOrErr.value)).toBeTruthy();

    const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
    expect(updatedNodeOrErr.isRight(), errToMsg(updatedNodeOrErr.value))
      .toBeTruthy();
    expect(updatedNodeOrErr.right.title).toBe("Updated Title");
    expect(updatedNodeOrErr.right.description).toBe("Updated Description");
  });

  test("should return error if node is not found", async () => {
    const service = nodeService();
    const updateOrErr = await service.update(authCtx, "not-found", {
      title: "Updated Title",
    });

    expect(updateOrErr.isLeft()).toBeTruthy();
    expect(updateOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("should return error if user doesn't have 'Write' permission on parent", async () => {
    const service = nodeService();
    const parent = await service.create(authCtx, {
      title: "Parent Folder",
      mimetype: "application/vnd.antbox.folder",
      permissions: {
        anonymous: [],
        group: ["Read"],
        authenticated: ["Read"],
        advanced: {},
      },
    });

    const node = await service.create(authCtx, {
      title: "Node",
      mimetype: "application/json",
      parent: parent.right.uuid,
    });

    const ctx: AuthenticationContext = {
      mode: "Direct",
      tenant: "",
      principal: { email: "otheruser@domain.com", groups: ["group-x"] },
    };

    const updateOrErr = await service.update(ctx, node.right.uuid, {
      title: "Updated Title",
    });

    expect(updateOrErr.isLeft()).toBeTruthy();
    expect(updateOrErr.value).toBeInstanceOf(ForbiddenError);
  });

  test("should not update mimetype", async () => {
    const service = nodeService();
    const parentOrErr = await service.create(authCtx, {
      title: "Parent Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    const nodeOrErr = await service.create(authCtx, {
      title: "Node with Mimetype",
      mimetype: Nodes.META_NODE_MIMETYPE,
      parent: parentOrErr.right.uuid,
    });

    const updateResult = await service.update(authCtx, nodeOrErr.right.uuid, {
      title: "Updated Title",
      mimetype: "application/json",
    });

    expect(updateResult.isRight(), errToMsg(updateResult.value)).toBeTruthy();

    const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
    expect(updatedNodeOrErr.isRight(), errToMsg(updatedNodeOrErr.value))
      .toBeTruthy();
    expect(updatedNodeOrErr.right.title).toBe("Updated Title");
    expect(updatedNodeOrErr.right.mimetype).toBe(Nodes.META_NODE_MIMETYPE);
  });
});

describe("NodeService.updateFile", () => {
  test("should update file content and metadata", async () => {
    const service = nodeService();
    const parent = await service.create(authCtx, {
      title: "Parent Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    const file = new File(["initial content"], "file.txt", {
      type: "text/plain",
    });
    const nodeOrErr = await service.createFile(authCtx, file, {
      parent: parent.right.uuid,
    });

    const updatedFile = new File(["updated contentxxx"], "file.txt", {
      type: "text/plain",
    });
    const updateOrErr = await service.updateFile(
      authCtx,
      nodeOrErr.right.uuid,
      updatedFile,
    );
    expect(updateOrErr.isRight(), errToMsg(updateOrErr.value)).toBeTruthy();

    const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
    const updatedFileOrErr = await service.export(
      authCtx,
      nodeOrErr.right.uuid,
    );

    expect(updatedNodeOrErr.isRight(), errToMsg(updatedNodeOrErr.value))
      .toBeTruthy();
    expect(updatedFileOrErr.isRight(), errToMsg(updatedFileOrErr.value))
      .toBeTruthy();
    expect((updatedNodeOrErr.right as FileNode).size).toBe(updatedFile.size);
    expect(updatedFileOrErr.right.size).toBe(updatedFile.size);
  });

  test("should return error if node is not found", async () => {
    const service = nodeService();
    const file = new File(["content"], "file.txt", { type: "text/plain" });
    const updateOrErr = await service.updateFile(authCtx, "not-found", file);

    expect(updateOrErr.isLeft()).toBeTruthy();
    expect(updateOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("should return error if node is not a file", async () => {
    const service = nodeService();
    const parent = await service.create(authCtx, {
      title: "Parent Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    const nodeOrErr = await service.create(authCtx, {
      title: "Meta Node",
      mimetype: Nodes.META_NODE_MIMETYPE,
      parent: parent.right.uuid,
    });

    const file = new File(["content"], "file.txt", { type: "text/plain" });
    const updateOrErr = await service.updateFile(
      authCtx,
      nodeOrErr.right.uuid,
      file,
    );

    expect(updateOrErr.isLeft()).toBeTruthy();
    expect(updateOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("should return error if user doesn't have 'Write' permission on parent", async () => {
    const service = nodeService();
    const parent = await service.create(authCtx, {
      title: "Parent Folder",
      mimetype: "application/vnd.antbox.folder",
      permissions: {
        anonymous: [],
        group: ["Read"],
        authenticated: ["Read"],
        advanced: {},
      },
    });

    const originalFile = new File(["content"], "file.txt", {
      type: "text/plain",
    });
    const nodeOrErr = await service.createFile(authCtx, originalFile, {
      parent: parent.right.uuid,
    });

    const ctx: AuthenticationContext = {
      mode: "Direct",
      tenant: "",
      principal: { email: "otheruser@domain.com", groups: ["group-x"] },
    };

    const file = new File(["content"], "file.txt", { type: "text/plain" });
    const updateOrErr = await service.updateFile(
      ctx,
      nodeOrErr.right.uuid,
      file,
    );

    expect(updateOrErr.isLeft()).toBeTruthy();
    expect(updateOrErr.value).toBeInstanceOf(ForbiddenError);
  });

  test("should return an error files have different mimetypes", async () => {
    const service = nodeService();
    const parent = await service.create(authCtx, {
      title: "Parent Folder",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    const file = new File(["content"], "file.txt", { type: "text/plain" });
    const nodeOrErr = await service.createFile(authCtx, file, {
      parent: parent.right.uuid,
    });

    const updatedFile = new File(["content"], "file.txt", {
      type: "application/json",
    });
    const updateOrErr = await service.updateFile(
      authCtx,
      nodeOrErr.right.uuid,
      updatedFile,
    );

    expect(updateOrErr.isLeft()).toBeTruthy();
    expect(updateOrErr.value).toBeInstanceOf(BadRequestError);
  });
});

const authCtx: AuthenticationContext = {
  mode: "Direct",
  tenant: "",
  principal: {
    email: "user@domain.com",
    groups: ["group-1", Groups.ADMINS_GROUP_UUID],
  },
};

const errToMsg = (
  // deno-lint-ignore no-explicit-any
  err: any,
) => (err?.message ? err.message : JSON.stringify(err));

const nodeService = (opts: Partial<NodeServiceContext> = {}) =>
  new NodeService({
    storage: opts.storage ?? new InMemoryStorageProvider(),
    repository: opts.repository ?? new InMemoryNodeRepository(),
    bus: opts.bus ?? new InMemoryEventBus(),
  });
