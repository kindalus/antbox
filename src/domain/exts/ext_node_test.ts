import { describe, test } from "bdd";
import { expect } from "expect";

import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Nodes } from "../nodes/nodes.ts";
import { ExtNode } from "./ext_node.ts";

test("ExtNode.constructor should initialize", () => {
  const extNode = ExtNode.create({
    title: "ExtNode",
    owner: "user@domain.com",
  });

  expect(extNode.right.title).toBe("ExtNode");
  expect(extNode.right.owner).toBe("user@domain.com");
  expect(extNode.right.mimetype).toBe(Nodes.EXT_MIMETYPE);
  expect(extNode.right.parent).toBe(Folders.EXT_FOLDER_UUID);
});

test("ExtNode.constructor should throw error if owner is missing", () => {
  const extNode = ExtNode.create({ title: "ExtNode" });

  expect(extNode.isLeft()).toBe(true);
  expect((extNode.value as ValidationError).message).toBe(
    "Node.owner is required",
  );
});

test("ExtNode.constructor should throw error if title is missing", () => {
  const extNode = ExtNode.create({ title: "", owner: "user@domain.com" });

  expect(extNode.isLeft()).toBe(true);
  expect((extNode.value as ValidationError).message).toBe(
    "Node.title is required",
  );
});

test("ExtNode.update should modify title and description", () => {
  const extNode = ExtNode.create({
    title: "ExtNode",
    owner: "user@domain.com",
  });

  const result = extNode.right.update({
    title: "New title",
    description: "New description",
  });

  expect(result.isRight()).toBe(true);
  expect(extNode.right.title).toBe("New title");
  expect(extNode.right.description).toBe("New description");
});

test("ExtNode.update should not modify parent", () => {
  const extNode = ExtNode.create({
    title: "ExtNode",
    owner: "user@domain.com",
  });

  const result = extNode.right.update({ parent: "--root--" });

  expect(result.isLeft()).toBe(true);
  expect(result.value).toBeInstanceOf(ValidationError);
  expect((result.value as ValidationError).errors[0].message).toBe(
    "Invalid ExtNode Parent: --root--",
  );
});

test("ExtNode.update should not modify mimetype", () => {
  const extNode = ExtNode.create({ title: "ExtNode", owner: "user@gmail.com" });

  extNode.right.update({ mimetype: "image/jpg" });
  expect(extNode.right.mimetype).toBe(Nodes.EXT_MIMETYPE);
});
