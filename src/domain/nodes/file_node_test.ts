import { describe, test } from "bdd";
import { expect } from "expect";
import { ValidationError } from "shared/validation_error.ts";
import { FileNode } from "./file_node.ts";
import { Folders } from "./folders.ts";
import { Nodes } from "./nodes.ts";

test("FileNode.create should initialize", () => {
  const result = FileNode.create({
    title: "New file",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
    mimetype: "application/pdf",
  });

  expect(result.isRight()).toBe(true);
  const fileNode = result.right;
  expect(Nodes.isFile(fileNode)).toBe(true);
  expect(fileNode.title).toBe("New file");
  expect(fileNode.parent).toBe(Folders.ROOT_FOLDER_UUID);
  expect(fileNode.owner).toBe("user@domain.com");
  expect(fileNode.mimetype).toBe("application/pdf");
});

test("FileNode.create should set the mimetype to 'application/javascript' if given 'text/javascript'", () => {
  const result = FileNode.create({
    title: "New file",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
    mimetype: "text/javascript",
  });
  expect(result.isRight()).toBe(true);
  const fileNode = result.right;
  expect(fileNode.mimetype).toBe("application/javascript");
});

test("FileNode.create should return error if mimetype is missing", () => {
  const result = FileNode.create({
    title: "New file",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
  });
  expect(result.isLeft()).toBe(true);
  expect(result.value).toBeInstanceOf(ValidationError);
});

test("FileNode.update should modify the title, fid, description and parent ", async () => {
  const createResult = FileNode.create({
    title: "Initial File",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
    mimetype: "application/pdf",
  });

  const fileNode = createResult.right;
  const initialModifiedTime = fileNode.modifiedTime;

  const timeout = (t: number) =>
    new Promise((res) => setTimeout(() => res(undefined), t));
  await timeout(5);

  const updateResult = fileNode.update({
    title: "Updated File",
    fid: "new-fid",
    description: "Updated Description",
    parent: "new-parent",
  });

  expect(updateResult.isRight()).toBe(true);
  expect(fileNode.title).toBe("Updated File");
  expect(fileNode.fid).toBe("new-fid");
  expect(fileNode.description).toBe("Updated Description");
  expect(fileNode.parent).toBe("new-parent");
  expect(fileNode.modifiedTime > initialModifiedTime).toBe(true);
});

test("FileNode.update should throw error if title is missing", () => {
  const fileNodeOrErr = FileNode.create({
    title: "Initial File",
    mimetype: "application/javascript",
    owner: "user@domain.com",
  });

  expect(fileNodeOrErr.isRight()).toBe(true);

  const result = fileNodeOrErr.right.update({ title: "" });

  expect(result.isLeft()).toBe(true);
  expect(result.value).toBeInstanceOf(ValidationError);
});
