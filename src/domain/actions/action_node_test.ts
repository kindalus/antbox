import { expect, test } from "bun:test";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Nodes } from "../nodes/nodes.ts";
import { ActionNode } from "./action_node.ts";

test("ActionNode.create should initialize", () => {
  const createResult = ActionNode.create({
    title: "Action Test",
    owner: "user@domain.com",
    runOnCreates: true,
  });
  const action = createResult.right;

  expect(createResult.isRight()).toBeTruthy();
  expect(action.mimetype).toBe(Nodes.ACTION_MIMETYPE);
  expect(action.parent).toBe(Folders.ACTIONS_FOLDER_UUID);
  expect(action.owner).toBe("user@domain.com");
  expect(action.runOnCreates).toBeTruthy();
});

test("ActionNode.create should throw error if title is missing", () => {
  const action = ActionNode.create({
    title: "",
    owner: "user@domain.com",
    runOnCreates: true,
  });

  expect(action.isLeft()).toBeTruthy();
  if (action.isLeft()) {
    expect(action.value).toBeInstanceOf(ValidationError);
    expect(action.value.message).toBe("Node.title is required");
  }
});

test("ActionNode.create should throw error if owner is missing", () => {
  const action = ActionNode.create({
    title: "Action Test",
    owner: "",
    runOnCreates: true,
  });

  expect(action.isLeft()).toBeTruthy();
  if (action.isLeft()) {
    expect(action.value).toBeInstanceOf(ValidationError);
    expect(action.value.message).toBe("Node.owner is required");
  }
});

test("ActionNode update should throw error if title is missing", () => {
  const action = ActionNode.create({
    title: "Action Test",
    owner: "user@domain.com",
    runOnCreates: true,
  });

  const result = action.right.update({ title: "" });
  expect(result.isLeft()).toBeTruthy();
  if (result.isLeft()) {
    expect(result.value).toBeInstanceOf(ValidationError);
    expect(result.value.message).toBe("Node.title is required");
  }
});

test("ActionNode update should modify runOnCreates, runOnUpdates, runManually, runAs, description, params, filters, groupsAllowed", () => {
  const createResult = ActionNode.create({
    title: "Action Test",
    owner: "user@domain.com",
    runOnCreates: true,
  });
  const action = createResult.right;

  const result = action.update({
    runOnCreates: false,
    runOnUpdates: true,
    runManually: false,
    runAs: "root",
    description: "Very good Action",
    params: ["tenant"],
    filters: [["parent", "==", "--root--"]],
    groupsAllowed: ["users", "writers"],
  });

  expect(result.isRight()).toBeTruthy();
  expect(action.runOnCreates).toBeFalsy();
  expect(action.runOnUpdates).toBeTruthy();
  expect(action.runManually).toBeFalsy();
  expect(action.runAs).toBe("root");
  expect(action.description).toBe("Very good Action");
  expect(action.params).toStrictEqual(["tenant"]);
  expect(action.filters).toStrictEqual([["parent", "==", "--root--"]]);
  expect(action.groupsAllowed).toStrictEqual(["users", "writers"]);
});

test("ActionNode update should not modify parent", () => {
  const createResult = ActionNode.create({
    title: "Action Test",
    owner: "user@domain.com",
  });
  const action = createResult.right;

  const result = action.update({ parent: Folders.ROOT_FOLDER_UUID });

  expect(result.isRight()).toBeTruthy();
  expect(action.parent).toBe(Folders.ACTIONS_FOLDER_UUID);
});

test("ActionNode update should not modify mimetype", () => {
  const createResult = ActionNode.create({
    title: "Action Test",
    owner: "user@domain.com",
  });
  const action = createResult.right;

  const result = action.update({ mimetype: "image/png" });

  expect(result.isRight()).toBeTruthy();
  expect(action.mimetype).toBe(Nodes.ACTION_MIMETYPE);
});
