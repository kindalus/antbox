import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { assertStrictEquals } from "@std/assert/strict-equals";
import { ValidationError } from "../../shared/validation_error.ts";
import { EmailFormatError } from "../nodes/email_format_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Nodes } from "../nodes/nodes.ts";
import { PropertyRequiredError } from "../nodes/property_required_error.ts";
import { InvalidFullNameFormatError } from "./invalid_fullname_format_error.ts";
import { InvalidPasswordFormatError } from "./invalid_password_format_error.ts";
import { InvalidUserNodeParentError } from "./invalid_user_node_parent_error.ts";
import { UserGroupRequiredError } from "./user_group_required_error.ts";
import { UserNode } from "./user_node.ts";

const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

Deno.test("UserNode constructor should initialize", () => {
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-pass",
    group: "users"
  })

  assertEquals(userNode.isRight(), true)
  assertEquals(userNode.right.email, userNode.right.email)
  assertEquals(userNode.right.title, "Example User")
  assertEquals(userNode.right.mimetype, Nodes.USER_MIMETYPE)
  assertEquals(userNode.right.parent, Folders.USERS_FOLDER_UUID)
})

Deno.test("UserNode constructor should throw error if secret has not the correct format", () => {
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "se",
    group: "users"
  })

  assertEquals(userNode.isLeft(), true)
  assertInstanceOf(userNode.value, ValidationError)
  assertInstanceOf(userNode.value.errors[0], InvalidPasswordFormatError)
})

Deno.test("UserNode constructor should throw error if group is empty", () => {
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: ""
  })

  assertEquals(userNode.isLeft(), true)
  assertInstanceOf(userNode.value, ValidationError)
  assertInstanceOf(userNode.value.errors[0], UserGroupRequiredError)
})

Deno.test("UserNode constructor should throw error if owner is missing", () => {
  const userNode = UserNode.create({
    owner: "",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users"
  })

  assertEquals(userNode.isLeft(), true)
  assertInstanceOf(userNode.value, ValidationError)
  assertInstanceOf(userNode.value.errors[0], PropertyRequiredError)
})

Deno.test("UserNode constructor should throw error if title length less than 3 chars", () => {
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Ex",
    secret: "secret-password",
    group: "users"
  })

  assertEquals(userNode.isLeft(), true)
  assertInstanceOf(userNode.value, ValidationError)
  assertInstanceOf(userNode.value.errors[0], InvalidFullNameFormatError)
})

Deno.test("UserNode constructor should hash the secret with right shaSum ", async () => {
  const secret = "secret-password" 
  const email = "user@domain.com"
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    title: "Example User",
    group: "users",
    email,
    secret
  })

  const sha = await UserNode.shaSum(email, secret)

	await timeout(2);

  assertStrictEquals(userNode.isRight(), true)
  assertEquals(userNode.right.secret, sha)
})

Deno.test("UserNode update should throw error if new secret is invalid", async () => {
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example user",
    secret: "secret-password",
    group: "users"
  })

  const result = userNode.right.update({secret: "ex"})

	await timeout(1);

  assertStrictEquals(result.isLeft(), true)
  assertInstanceOf(result.value, ValidationError)
  assertInstanceOf(result.value.errors[0], InvalidPasswordFormatError)
})

Deno.test("UserNode update should modify secret and create a new hash", async () => {
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example user",
    secret: "secret-password",
    group: "users"
  })

  const sha  = await UserNode.shaSum("user@domain.com", "example.com")
  const result = userNode.right.update({secret: "example.com"})
	await timeout(1);

  assertStrictEquals(result.isRight(), true)
  assertStrictEquals(userNode.right.secret, sha)
})

Deno.test("UserNode update should throw error if new email is invalid", () => {
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example user",
    secret: "secret-password",
    group: "users"
  })

  const result = userNode.right.update({email: "example.com"})

  assertStrictEquals(result.isLeft(), true)
  assertInstanceOf(result.value, ValidationError)
  assertInstanceOf(result.value.errors[0], EmailFormatError)
})

Deno.test("UserNode update should modify group e groups", () => {
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users",
    groups: ["bankers", "writers"]
  })

  const result = userNode.right.update({group: "admin", groups: []})

  assertStrictEquals(result.isRight(), true)
  assertStrictEquals(userNode.right.group, "admin")
  assertEquals(userNode.right.groups, [])
})

Deno.test("UserNode update should not modify parent ", () => {
  const userNode = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users"
  })

  const result = userNode.right.update({ parent: "--root--" })

  assertStrictEquals(result.isLeft(), true)
  assertInstanceOf(result.value, ValidationError)
  assertInstanceOf(result.value.errors[0], InvalidUserNodeParentError)
})
