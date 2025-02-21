import { FolderNode } from "./folder_node.ts";
import { Folders } from "./folders.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Nodes } from "./nodes.ts";
import { test, expect } from "bun:test";

test("FolderNode.create should initialize", () => {
  const result = FolderNode.create({
    title: "New folder",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
    group: "group-1",
  });

  expect(result.isRight()).toBe(true);
  const folderNode = result.right;
  expect(Nodes.isFolder(folderNode)).toBe(true);
  expect(folderNode.title).toBe("New folder");
  expect(folderNode.parent).toBe(Folders.ROOT_FOLDER_UUID);
  expect(folderNode.owner).toBe("user@domain.com");
  expect(folderNode.group).toBe("group-1");
});

test("FolderNode.create should return error if group is missing", () => {
  const result = FolderNode.create({
    title: "New folder",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
  });
  expect(result.isLeft()).toBe(true);
  expect(result.value).toBeInstanceOf(ValidationError);
});

test("FolderNode.create should always have application/vnd.antbox.folder mimetype", () => {
  const result = FolderNode.create({
    title: "Title",
    mimetype: "application/json",
    owner: "user@domain.com",
    parent: Folders.ROOT_FOLDER_UUID,
    group: "group-1",
  });

  expect(result.isRight()).toBe(true);
  expect(result.right.mimetype).toBe(Nodes.FOLDER_MIMETYPE);
});

test("FolderNode.update should modify the title, fid, description, permissions and parent ", async () => {
  const createResult = FolderNode.create({
    title: "Initial Folder",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
    group: "group-1",
  });
  const folderNode = createResult.right;
  const initialModifiedTime = folderNode.modifiedTime;

  const timeout = (t: number) =>
    new Promise((res) => setTimeout(() => res(undefined), t));
  await timeout(5);

  const updateResult = folderNode.update({
    title: "Updated Folder",
    fid: "new-fid",
    description: "new description",
    permissions: {
      group: ["Read"],
      authenticated: [],
      anonymous: [],
      advanced: {
        "custom-group": ["Read", "Write"],
      },
    },
    parent: "new-parent",
  });

  expect(updateResult.isRight()).toBe(true);
  expect(folderNode.title).toBe("Updated Folder");
  expect(folderNode.fid).toBe("new-fid");
  expect(folderNode.description).toBe("new description");
  expect(folderNode.permissions.group).toEqual(["Read"]);
  expect(folderNode.permissions.authenticated).toEqual([]);
  expect(folderNode.permissions.anonymous).toEqual([]);
  expect(folderNode.permissions.advanced["custom-group"]).toEqual([
    "Read",
    "Write",
  ]);
  expect(folderNode.parent).toBe("new-parent");
  expect(folderNode.modifiedTime !== initialModifiedTime).toBe(true);
});

test("FolderNode.update should not change createdTime", () => {
  const createResult = FolderNode.create({
    title: "Initial Folder",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
    group: "group-1",
  });
  const folderNode = createResult.right;
  const createdTime = folderNode.createdTime;

  // Update with valid new title and same group value
  folderNode.update({ title: "Another Title", group: "group-1" });
  expect(folderNode.createdTime).toBe(createdTime);
});

test("FolderNode.update should return error if update results in invalid title", () => {
  const createResult = FolderNode.create({
    title: "Valid title",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
    group: "group-1",
  });
  const folderNode = createResult.right;

  const updateResult = folderNode.update({ title: "" });
  expect(updateResult.isLeft()).toBe(true);
  expect(updateResult.value).toBeInstanceOf(ValidationError);
});

test("FolderNode.update should not update group", () => {
  const createResult = FolderNode.create({
    title: "Valid Folder",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
    group: "group-1",
  });
  const folderNode = createResult.right;

  const updateResult = folderNode.update({ group: "group-2" });
  expect(updateResult.isRight()).toBeTruthy();
  expect(folderNode.group).toBe("group-1");
});
