import { describe, expect, test, spyOn } from "bun:test";
import { NodeService } from "./node_service";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import type { AuthenticationContext } from "./authentication_context";
import { Groups } from "domain/users_groups/groups";
import { ForbiddenError } from "shared/antbox_error";
import type { NodeServiceContext } from "./node_service_context";
import { Folders } from "domain/nodes/folders";
import { FileNode } from "domain/nodes/file_node";
import { Nodes } from "domain/nodes/nodes";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus";
import type { EventBus } from "shared/event_bus";

describe("NodeService.delete", () => {
  test("should delete a node and its metadata", async () => {
    const node = FileNode.create({
      title: "Node to delete",
      mimetype: Nodes.SMART_FOLDER_MIMETYPE,
      owner: "tester@domain.com",
      parent: Folders.ROOT_FOLDER_UUID,
    }).right;

    // const bus: EventBus = new InMemoryEventBus();
    const bus: EventBus = {
      publish: async () => undefined,
      subscribe: () => undefined,
      unsubscribe: () => undefined,
    };

    spyOn(bus, "publish");

    const repository = new InMemoryNodeRepository();
    await repository.add(node);

    const service = nodeService({ repository, bus });

    const deleteOrErr = await service.delete(authCtx, node.uuid);

    expect(deleteOrErr.isRight(), errToMsg(deleteOrErr.value)).toBeTruthy();

    const getNodeOrErr = await service.get(authCtx, node.uuid);
    expect(getNodeOrErr.isLeft(), errToMsg(getNodeOrErr.value)).toBeTruthy();
    expect(getNodeOrErr.value).toBeInstanceOf(NodeNotFoundError);
    expect(bus.publish).toHaveBeenCalled();
  });

  test("should return error if node is not found", async () => {
    const service = nodeService();

    const deleteOrErr = await service.delete(authCtx, "not-found");
    expect(deleteOrErr.isLeft()).toBeTruthy();
    expect(deleteOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("should remove all childs if node is a folder", async () => {
    const service = nodeService();

    const folder = await service.create(authCtx, {
      title: "Folder to delete",
      mimetype: Nodes.FOLDER_MIMETYPE,
    });

    const child = await service.create(authCtx, {
      title: "Child",
      mimetype: Nodes.META_NODE_MIMETYPE,
      parent: folder.right.uuid,
    });

    const deleteOrErr = await service.delete(authCtx, folder.right.uuid);
    expect(deleteOrErr.isRight(), errToMsg(deleteOrErr.value)).toBeTruthy();

    const getChildOrErr = await service.get(authCtx, child.right.uuid);
    expect(getChildOrErr.isLeft()).toBeTruthy();
    expect(getChildOrErr.value).toBeInstanceOf(NodeNotFoundError);
  });

  test("should return a error if principal is no allowed to write on parent folder", async () => {
    const service = nodeService();

    const parent = await service.create(authCtx, {
      title: "Parent",
      mimetype: "application/vnd.antbox.folder",
    });

    const node = await service.create(authCtx, {
      title: "Node",
      mimetype: "application/json",
      parent: parent.right.uuid,
    });

    const ctx: AuthenticationContext = {
      mode: "Direct",
      tenant: "",
      principal: {
        email: "otheruser@domain.com",
        groups: ["group-x"],
      },
    };

    const deleteOrErr = await service.delete(ctx, node.right.uuid);
    expect(deleteOrErr.isLeft()).toBeTruthy();
    expect(deleteOrErr.value).toBeInstanceOf(ForbiddenError);
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

const errToMsg = (err: unknown) => {
  if (err instanceof Error) {
    return `Error: ${err.message}`;
  }

  return `Error: ${JSON.stringify(err, null, 2)}`;
};

const nodeService = (opts: Partial<NodeServiceContext> = {}) =>
  new NodeService({
    storage: opts.storage ?? new InMemoryStorageProvider(),
    repository: opts.repository ?? new InMemoryNodeRepository(),
    bus: opts.bus ?? new InMemoryEventBus(),
  });
