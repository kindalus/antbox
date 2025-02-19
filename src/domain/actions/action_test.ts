import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { assertStrictEquals } from "@std/assert/strict-equals";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Nodes } from "../nodes/nodes.ts";
import { ActionNode } from "./action_node.ts";
import { InvalidActionParentError } from "./invalid_action_parent_error.ts";

Deno.test("ActionNode constructor should initialize", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com", runOnCreates: true})

  assertStrictEquals(action.isRight(), true)
  assertEquals(action.right.mimetype, Nodes.ACTION_MIMETYPE)
  assertEquals(action.right.parent, Folders.ACTIONS_FOLDER_UUID)
  assertEquals(action.right.owner, "user@domain.com")
  assertStrictEquals(action.right.runOnCreates, true)
})

Deno.test("ActionNode constructor should throw error if title is missing", () => {
  const action = ActionNode.create({title: "", owner: "user@domain.com",  runOnCreates: true})

  assertInstanceOf(action.value, ValidationError)
  assertEquals(action.value.message, "Node.title is required")
})

Deno.test("ActionNode constructor should throw error if owner is missing", () => {
  const action = ActionNode.create({title: "Action Test", owner: "",  runOnCreates: true})

  assertInstanceOf(action.value, ValidationError)
  assertStrictEquals(action.value.message, "Node.owner is required")
})

Deno.test("ActionNode update should throw error if title is missing", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com",  runOnCreates: true})

  const result = action.right.update({title: ""})
  assertInstanceOf(result.value, ValidationError)
  assertStrictEquals(result.value.message, "Node.title is required")
})


Deno.test("ActionNode update should modify runOnCreates", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com",  runOnCreates: true})

  const result = action.right.update({runOnCreates: false})

  assertStrictEquals(result.isRight(), true)
  assertStrictEquals(action.right.runOnCreates, false)
})

Deno.test("ActionNode update should modify runOnUpdates", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com",  runOnCreates: true})

  const result = action.right.update({runOnUpdates: true})

  assertStrictEquals(result.isRight(), true)
  assertStrictEquals(action.right.runOnUpdates, true)
})

Deno.test("ActionNode update should modify runManually", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com",  runOnCreates: true})

  const result = action.right.update({runManually:false})

  assertStrictEquals(result.isRight(), true)
  assertStrictEquals(action.right.runManually, false)
})

Deno.test("ActionNode update should modify runAs", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com"})

  const result = action.right.update({runAs:"root"})

  assertStrictEquals(result.isRight(), true)
  assertStrictEquals(action.right.runAs, "root")
})


Deno.test("ActionNode update should modify description", () => {
  const action = ActionNode.create({title: "Action Test", description: "Action For tests", owner: "user@domain.com"})

  const result = action.right.update({description: "Very good Action"})

  assertStrictEquals(result.isRight(), true)
  assertStrictEquals(action.right.description, "Very good Action")
})


Deno.test("ActionNode update should modify params", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com", params: ["groupId", "tenant"]})

  const result = action.right.update({params:["tenant"]})

  assertStrictEquals(result.isRight(), true)
  assertEquals(action.right.params, ["tenant"])
})

Deno.test("ActionNode update should modify filters", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com", filters: [["mimetype", "==", "application/vnd.antbox.action"]]})

  const result = action.right.update({filters:  [["parent", "==", "--root--"]]})

  assertStrictEquals(result.isRight(), true)
  assertEquals(action.right.filters, [["parent", "==", "--root--"]])
})

Deno.test("ActionNode update should modify groupsAllowed", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com", groupsAllowed: []})

  const result = action.right.update({groupsAllowed:  ["users", "writers"]})

  assertStrictEquals(result.isRight(), true)
  assertEquals(action.right.groupsAllowed, ["users", "writers"])
})

Deno.test("ActionNode update should not modify parent", () => {
  const action = ActionNode.create({title: "Action Test", owner: "user@domain.com",})

  const result = action.right.update({parent: Folders.ROOT_FOLDER_UUID})

  assertStrictEquals(result.isLeft(), true)
  assertInstanceOf(result.value, ValidationError)
  assertInstanceOf(result.value.errors[0], InvalidActionParentError)
})

