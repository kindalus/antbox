import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { assertStrictEquals } from "@std/assert/strict-equals";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Nodes } from "../nodes/nodes.ts";
import { ActionNode } from "./action_node.ts";

Deno.test("ActionNode constructor should initialize", () => {
  const createResult = ActionNode.create({
    title: "Action Test",
    owner: "user@domain.com",
    runOnCreates: true,
  });
  const action = createResult.right

  assertStrictEquals(createResult.isRight(), true);
  assertEquals(action.mimetype, Nodes.ACTION_MIMETYPE);
  assertEquals(action.parent, Folders.ACTIONS_FOLDER_UUID);
  assertEquals(action.owner, "user@domain.com");
  assertStrictEquals(action.runOnCreates, true);
});

Deno.test(
  "ActionNode constructor should throw error if title is missing",
  () => {
    const action = ActionNode.create({
      title: "",
      owner: "user@domain.com",
      runOnCreates: true,
    });

    assertInstanceOf(action.value, ValidationError);
    assertEquals(action.value.message, "Node.title is required");
  }
);

Deno.test(
  "ActionNode constructor should throw error if owner is missing",
  () => {
    const action = ActionNode.create({
      title: "Action Test",
      owner: "",
      runOnCreates: true,
    });

    assertInstanceOf(action.value, ValidationError);
    assertStrictEquals(action.value.message, "Node.owner is required");
  }
);

Deno.test("ActionNode update should throw error if title is missing", () => {
  const action = ActionNode.create({
    title: "Action Test",
    owner: "user@domain.com",
    runOnCreates: true,
  });

  const result = action.right.update({ title: "" });
  assertInstanceOf(result.value, ValidationError);
  assertStrictEquals(result.value.message, "Node.title is required");
});

Deno.test(
  "ActionNode update should modify runOnCreates, runOnUpdates, runManually, runAs, description, params, filters, groupsAllowed",
  () => {
    const createResult = ActionNode.create({
      title: "Action Test",
      owner: "user@domain.com",
      runOnCreates: true,
    });
    const action = createResult.right

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

    assertStrictEquals(result.isRight(), true);
    assertStrictEquals(action.runOnCreates, false);
    assertStrictEquals(action.runOnUpdates, true);
    assertStrictEquals(action.runManually, false);
    assertStrictEquals(action.runAs, "root");
    assertStrictEquals(action.description, "Very good Action");
    assertEquals(action.params, ["tenant"]);
    assertEquals(action.filters, [["parent", "==", "--root--"]]);
    assertEquals(action.groupsAllowed, ["users", "writers"]);
  }
);

Deno.test("ActionNode update should not modify parent", () => {
  const createResult = ActionNode.create({
    title: "Action Test",
    owner: "user@domain.com",
  });
  const action = createResult.right

  const result = action.update({ parent: Folders.ROOT_FOLDER_UUID });

  assertStrictEquals(result.isRight(), true);
  assertStrictEquals(action.parent, Folders.ACTIONS_FOLDER_UUID);
  
});

Deno.test("ActionNode update should not modify mimetype", () => {
  const createResult = ActionNode.create({
    title: "Action Test",
    owner: "user@domain.com",
  });
  const action = createResult.right

  const result = action.update({ mimetype: "image/png" });

  assertStrictEquals(result.isRight(), true);
  assertStrictEquals(action.mimetype, Nodes.ACTION_MIMETYPE);
});