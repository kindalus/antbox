import { test, expect } from "bun:test";
import { Node } from "./node.ts";
import { Folders } from "./folders.ts";
import { ValidationError } from "shared/validation_error.ts";
import { FidGenerator } from "shared/fid_generator.ts";

test("Node constructor should initialize", () => {
  const node = new Node({
    title: "New node",
    mimetype: "application/json",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
  });

  expect(node.title).toBe("New node");
  expect(node.mimetype).toBe("application/json");
  expect(node.parent).toBe(Folders.ROOT_FOLDER_UUID);
  expect(node.owner).toBe("user@domain.com");
});

test("Node constructor should generate fid with title if not provided", () => {
  const node = new Node({
    title: "Node with generated fid",
    mimetype: "application/json",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
  });

  expect(node.fid?.length, "Fid is empty").toBeTruthy();
  expect(FidGenerator.generate(node.title)).toBe(node.fid);
});

test("Node constructor should throw error if title is missing", () => {
  expect(() => {
    new Node({
      title: "",
      mimetype: "application/json",
      owner: "user",
      parent: Folders.ROOT_FOLDER_UUID,
    });
  }).toThrow();
});

test("Node constructor should throw error if mimetype is missing", () => {
  expect(() => {
    new Node({
      title: "Title",
      mimetype: "",
      owner: "user",
      parent: Folders.ROOT_FOLDER_UUID,
    });
  }).toThrow();
});

test("Node constructor should throw error if parent is missing", () => {
  expect(() => {
    new Node({
      title: "Title",
      mimetype: "application/json",
      owner: "user",
      parent: "",
    });
  }).toThrow();
});

test("Node constructor should throw error if owner is missing", () => {
  expect(() => {
    new Node({
      title: "Title",
      mimetype: "application/json",
      owner: "",
      parent: Folders.ROOT_FOLDER_UUID,
    });
  }).toThrow();
});

test("Node update should modify the title, fid and description", () => {
  const node = new Node({
    title: "Initial Title",
    description: "Initial Description",
    mimetype: "application/pdf",
    owner: "user@domain.com",
  });

  node.update({
    title: "Updated Title",
    fid: "new-fid",
    description: "Updated Description",
    owner: "user@domain.com",
  });

  expect(node.title).toBe("Updated Title");
  expect(node.fid).toBe("new-fid");
  expect(node.description).toBe("Updated Description");
});

test("Node update should not modify the createdTime", () => {
  const node = new Node({
    title: "Initial Title",
    mimetype: "text/plain",
    owner: "user@domain.com",
  });
  const createdTime = node.createdTime;
  node.update({ title: "Updated Title" });
  expect(node.createdTime).toBe(createdTime);
});

test("Node update should throw error if title is missing", () => {
  const node = new Node({
    title: "Initial Title",
    mimetype: "application/javascript",
    owner: "user@domain.com",
  });

  const result = node.update({ title: "" });

  expect(result.isLeft()).toBeTruthy();
  expect(result.value).toBeInstanceOf(ValidationError);
});

test("Node update should throw error if parent is missing", () => {
  const node = new Node({
    title: "Initial Title",
    mimetype: "application/javascript",
    owner: "user@domain.com",
  });

  const result = node.update({ parent: "" });

  expect(result.isLeft()).toBeTruthy();
  expect(result.value).toBeInstanceOf(ValidationError);
});

test("Node update should modify the modifiedTime", async () => {
  const node = new Node({
    title: "Initial Title",
    mimetype: "application/pdf",
    owner: "user@domain.com",
  });
  const initialModifiedTime = node.modifiedTime;

  const timeout = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  await timeout(5);

  node.update({ title: "Updated Title" });
  expect(node.modifiedTime !== initialModifiedTime).toBeTruthy();
});

test("Node.update should generate fid if empty", () => {
  const node = new Node({
    title: "Initial File",
    parent: Folders.ROOT_FOLDER_UUID,
    owner: "user@domain.com",
    mimetype: "application/pdf",
  });
  const originalFid = node.fid;
  const updateResult = node.update({ title: "New title", fid: "" });
  expect(updateResult.isRight()).toBeTruthy();
  expect(node.fid !== originalFid, "Fid should be different").toBe(true);
  expect(node.fid !== "", "Fid should not be empty").toBe(true);
});

test("Node.update should not modify the mimetype", () => {
  const node = new Node({
    title: "Initial File",
    mimetype: "text/plain",
    owner: "user@domain.com",
  });

  node.update({ mimetype: "aplication/pdf" });
  expect(node.mimetype).toBe("text/plain");
});
