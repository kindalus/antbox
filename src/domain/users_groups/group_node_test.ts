import { test } from "bdd";
import { expect } from "expect";
import { ValidationError } from "shared/validation_error.ts";
import { EmailFormatError } from "domain/nodes/email_format_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { GroupNode } from "./group_node.ts";
import {
  PropertyFormatError,
  PropertyRequiredError,
} from "domain/nodes/property_errors.ts";

test("GroupNode.create should initialize", () => {
  const createResult = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group Test",
    description: "Test Group",
  });
  const group = createResult.right;

  expect(group.owner).toBe("root@antbox.io");
  expect(group.title).toBe("Group Test");
  expect(group.mimetype).toBe(Nodes.GROUP_MIMETYPE);
  expect(group.parent).toBe(Folders.GROUPS_FOLDER_UUID);
});

test("GroupNode.create should throw error if owner is missing", () => {
  const createResult = GroupNode.create({
    title: "Group Test",
    description: "Test Group",
  });

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect((createResult.value as ValidationError).errors[0]).toBeInstanceOf(
    PropertyRequiredError,
  );
  expect((createResult.value as ValidationError).errors[0].message).toBe(
    "Node.owner is required",
  );
});

test("GroupNode.create should throw error if owner is invalid email format", () => {
  const createResult = GroupNode.create({
    owner: "user@examplecom",
    title: "Group Test",
    description: "Test Group",
  });

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect((createResult.value as ValidationError).errors[0]).toBeInstanceOf(
    EmailFormatError,
  );
});

test("GroupNode.create should throw error if title is missing", () => {
  const createResult = GroupNode.create({
    owner: "root@antbox.io",
    description: "Test Group",
  });

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect((createResult.value as ValidationError).errors[0]).toBeInstanceOf(
    PropertyRequiredError,
  );
  expect((createResult.value as ValidationError).errors[0].message).toBe(
    "Node.title is required",
  );
});

test("GroupNode.create should throw error if title lenght is less than 3 chars", () => {
  const createResult = GroupNode.create({
    title: "Gr",
    owner: "root@antbox.io",
    description: "Test Group",
  });

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect((createResult.value as ValidationError).errors[0]).toBeInstanceOf(
    PropertyFormatError,
  );
});

test("GroupNode.update should modify title and description", () => {
  const createResult = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group",
    description: "Test Group",
  });

  const result = createResult.right.update({
    title: "Group-2",
    description: "Desc 2",
  });

  expect(result.isRight()).toBe(true);
  expect(createResult.right.title).toBe("Group-2");
  expect(createResult.right.description).toBe("Desc 2");
});

test("GroupNode.update should not modify parent ", () => {
  const group = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group",
    description: "Test Group",
  });

  const result = group.right.update({ parent: "--root--" });

  expect(result.isRight()).toBe(true);
  expect(group.right.parent).toBe(Folders.GROUPS_FOLDER_UUID);
});

test("GroupNode.update should not modify mimetype ", () => {
  const group = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group",
    description: "Test Group",
  });

  const result = group.right.update({ mimetype: "image/jpg" });

  expect(result.isRight()).toBe(true);
  expect(group.right.mimetype).toBe(Nodes.GROUP_MIMETYPE);
});
