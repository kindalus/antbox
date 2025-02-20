import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { ValidationError } from "../../shared/validation_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Nodes } from "../nodes/nodes.ts";
import { ApiKeyNode } from "./api_key_node.ts";

Deno.test("ApiKeyNode.create should initialize", () => {
  const apiKey = ApiKeyNode.create({group: "admin", secret: "secret-pasword", description: "API Key super hard", title: "ApiKey test", owner: "user@domain.com"})

  assertEquals(apiKey.right.title, "secr******")
  assertEquals(apiKey.right.group, "admin")
  assertEquals(apiKey.right.description, "API Key super hard")
  assertEquals(apiKey.right.mimetype, Nodes.API_KEY_MIMETYPE)
  assertEquals(apiKey.right.parent, Folders.API_KEYS_FOLDER_UUID)
})

Deno.test("ApiKeyNode.create should throw error if owner is missing", () => {
  const apiKey = ApiKeyNode.create({title: "Api key title", secret: "secret", group: "admin"})

  assertEquals(apiKey.isLeft(), true)
  assertEquals((apiKey.value as  ValidationError).message, "Node.owner is required")
})

Deno.test("ApiKeyNode.create should throw error if secret is missing", () => {
  const apiKey = ApiKeyNode.create({title: "Api key title", secret: "", group: "admin"})

  assertEquals(apiKey.isLeft(), true)
  assertEquals((apiKey.value as ValidationError).message, "Node.secret is required")
})

Deno.test("ApiKeyNode.create should throw error if group is missing", () => {
  const apiKey = ApiKeyNode.create({title: "Api key title", secret: "secret", group: ""})

  assertEquals(apiKey.isLeft(), true)
  assertEquals((apiKey.value as ValidationError).message, "Node.group is required")
})

Deno.test("ApiKeyNode update should modify group", () => {
  const apiKey = ApiKeyNode.create({title: "Api key title", owner: "user@domain.com", secret: "secret", group: "admin"})

  const result =  apiKey.right.update({group: "users"})
  assertEquals(result.isRight(), true)
  assertEquals(apiKey.right.group, "users")
})

Deno.test("ApiKeyNode update should modify description", () => {
  const apiKey = ApiKeyNode.create({title: "Api key title", owner: "user@domain.com", secret: "secret", group: "admin", description: "api key desc"})

  const result =  apiKey.right.update({description: "api key"})
  assertEquals(result.isRight(), true)
  assertEquals(apiKey.right.description, "api key")
})

Deno.test("ApiKeyNode update should throw error if secret is missing", () => {
  const apiKey = ApiKeyNode.create({title: "Api key title", owner: "user@domain.com", secret: "secret", group: "admin"})

  const result =  apiKey.right.update({secret: ""})
    
  assertEquals(result.isLeft(), true)
  assertInstanceOf(result.value, ValidationError)
  assertEquals(result.value.errors[0].message, "Node.secret is required")
})

Deno.test("ApiKeyNode update should throw error if group is missing", () => {
  const apiKey = ApiKeyNode.create({title: "Api key title", owner: "user@domain.com", secret: "secret", group: "admin"})

  const result =  apiKey.right.update({group: ""})
    
  assertEquals(result.isLeft(), true)
  assertInstanceOf(result.value, ValidationError)
  assertEquals(result.value.errors[0].message, "Node.group is required")
})

Deno.test("ApiKeyNode update should not modify parent", () => {
  const apiKey = ApiKeyNode.create({title: "Api key title", owner: "user@domain.com", secret: "secret", group: "admin"})

  const result =  apiKey.right.update({parent: "--root--"})

  assertEquals(result.isRight(), true)
  assertEquals(apiKey.right.parent, Folders.API_KEYS_FOLDER_UUID)
})
