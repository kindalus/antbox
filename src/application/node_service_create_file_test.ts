import { describe, test, expect } from "bun:test";
import { NodeService } from "./node_service";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository";
import type { AuthenticationContext } from "./authentication_context";
import { FolderNode } from "domain/nodes/folder_node";
import type { FileNode } from "domain/nodes/file_node";
import type { FileLikeNode } from "domain/nodes/node_like";
import { Folders } from "domain/nodes/folders";

test("should create a file", async () => {
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

test("creating files inside root folder isn't allowed", async () => {
  const nodeOrErr = await nodeService().createFile(authCtx, dummyFile, {
    parent: Folders.ROOT_FOLDER_UUID,
  });

  expect(nodeOrErr.isLeft(), errToMsg(nodeOrErr.value)).toBeTruthy();
  expect(nodeOrErr.value).toBeInstanceOf(NodeService);
});

const authCtx: AuthenticationContext = {
  mode: "Direct",
  tenant: "",
  principal: {
    email: "user@example.com",
    groups: ["admin", "user"],
  },
};

const errToMsg = (err: any) =>
  err.message ? err.message : JSON.stringify(err);

const nodeService = () =>
  new NodeService({
    storage: new InMemoryStorageProvider(),
    repository: new InMemoryNodeRepository(),
  });

const dummyFile = new File(["Ola"], "ola.txt", { type: "text/plain" });
