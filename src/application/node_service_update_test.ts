import { describe, test, expect } from "bun:test";
import { NodeService } from "./node_service";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { Groups } from "domain/auth/groups";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error";
import { ForbiddenError } from "shared/antbox_error";
import type { AuthenticationContext } from "./authentication_context";
import type { NodeServiceContext } from "./node_service_context";
import { Nodes } from "domain/nodes/nodes";

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
    expect(updatedNodeOrErr.isRight(), errToMsg(updatedNodeOrErr.value)).toBeTruthy();
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
      expect(updatedNodeOrErr.isRight(), errToMsg(updatedNodeOrErr.value)).toBeTruthy();
      expect(updatedNodeOrErr.right.title).toBe("Updated Title");
      expect(updatedNodeOrErr.right.mimetype).toBe(Nodes.META_NODE_MIMETYPE);
    });
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

const errToMsg = (err: any) => (err?.message ? err.message : JSON.stringify(err));

const nodeService = (opts: Partial<NodeServiceContext> = {}) =>
  new NodeService({
    storage: opts.storage ?? new InMemoryStorageProvider(),
    repository: opts.repository ?? new InMemoryNodeRepository(),
  });
