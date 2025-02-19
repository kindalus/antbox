import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { assertStrictEquals } from "@std/assert/strict-equals";
import { ValidationError } from "../../shared/validation_error.ts";
import { EmailFormatError } from "../nodes/email_format_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Nodes } from "../nodes/nodes.ts";
import { PropertyRequiredError } from "../nodes/property_required_error.ts";
import { GroupNode } from "./group_node.ts";
import { InvalidFullNameFormatError } from "./invalid_fullname_format_error.ts";
import { InvalidGroupParentError } from "./invalid_group_node_parent_error.ts";

Deno.test("GroupNode constructor should initialize", () => {
  const group = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group Test",
    description: "Test Group",
  })

  assertEquals(group.right.owner, "root@antbox.io")
  assertEquals(group.right.title, "Group Test")
  assertEquals(group.right.mimetype, Nodes.GROUP_MIMETYPE)
  assertEquals(group.right.parent, Folders.GROUPS_FOLDER_UUID)
})

Deno.test("GroupNode constructor should throw error if owner is missing", () => {
  const group = GroupNode.create({
    title: "Group Test",
    description: "Test Group",
  })

  assertStrictEquals(group.isLeft(), true)
  assertInstanceOf(group.value, ValidationError)
  assertInstanceOf(group.value.errors[0], PropertyRequiredError)
  assertEquals(group.value.errors[0].message, "Node.owner is required")
})


Deno.test("GroupNode constructor should throw error if owner is invalid email format", () => {
  const group = GroupNode.create({
    owner: "user@examplecom",
    title: "Group Test",
    description: "Test Group",
  })

  assertStrictEquals(group.isLeft(), true)
  assertInstanceOf(group.value, ValidationError)
  assertInstanceOf(group.value.errors[0], EmailFormatError)
})

Deno.test("GroupNode constructor should throw error if title is missing", () => {
  const group = GroupNode.create({
    owner: "root@antbox.io",
    description: "Test Group",
  })

  assertStrictEquals(group.isLeft(), true)
  assertInstanceOf(group.value, ValidationError)
  assertInstanceOf(group.value.errors[0], PropertyRequiredError)
  assertEquals(group.value.errors[0].message, "Node.title is required")
})

Deno.test("GroupNode constructor should throw error if title lenght is less than 3 chars", () => {
  const group = GroupNode.create({
    title: "Gr",
    owner: "root@antbox.io",
    description: "Test Group",
  })

  assertStrictEquals(group.isLeft(), true)
  assertInstanceOf(group.value, ValidationError)
  assertInstanceOf(group.value.errors[0], InvalidFullNameFormatError)
})

Deno.test("GroupNode update should modify title and description", () => {
  const group = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group",
    description: "Test Group",
  })

  const result = group.right.update({title: "Group-2", description: "Desc 2"})

  assertStrictEquals(result.isRight(), true)
  assertStrictEquals(group.right.title, "Group-2")
  assertStrictEquals(group.right.description, "Desc 2")
})

Deno.test("GroupNode update should not modify parent ", () => {
  const group = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group",
    description: "Test Group",
  })

  const result = group.right.update({parent: "--root--"})

  assertStrictEquals(result.isLeft(), true)
  assertInstanceOf(result.value, ValidationError)
  assertInstanceOf(result.value.errors[0], InvalidGroupParentError)
})

