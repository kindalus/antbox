import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { ValidationError } from "../../shared/validation_error.ts";
import { Nodes } from "../nodes/nodes.ts";
import { PropertyRequiredError } from "../nodes/property_required_error.ts";
import { ArticleNode } from "./article_node.ts";

Deno.test("ArticleNode.create should initialize", () => {
  const createResult = ArticleNode.create({title: "Article Test", owner: "user@domain.com", description: "Article description"})

  assertEquals(createResult.isRight(), true)
  const article =createResult.right
  assertEquals(article.title, "Article Test")
  assertEquals(article.owner, "user@domain.com")
  assertEquals(article.description, "Article description")
  assertEquals(article.mimetype, Nodes.ARTICLE_MIMETYPE)
})

Deno.test("ArticleNode.create should throw error if title is missing", () => {
  const createResult = ArticleNode.create({owner: "user@domain.com"})

  assertEquals(createResult.isLeft(), true)
  assertInstanceOf(createResult.value, ValidationError)
  assertEquals(createResult.value.message, "Node.title is required")
})

Deno.test("ArticleNode.create should throw error if owner is missing", () => {
  const createResult = ArticleNode.create({title: "Article test", })

  assertEquals(createResult.isLeft(), true)
  assertInstanceOf(createResult.value, ValidationError)
  assertEquals(createResult.value.message, "Node.owner is required")
})

Deno.test("ArticleNode.update should modify title", () => {
  const createResult = ArticleNode.create({title: "Article test", owner: "user@domain.com"})

  const updateResult =  createResult.right.update({title: "Article"})

  assertEquals(updateResult.isRight(), true)
  assertEquals(createResult.right.title, "Article")
})

Deno.test("ArticleNode.update should modify description", () => {
  const createResult = ArticleNode.create({title: "Article test", owner: "user@domain.com", description: "Desc for Article"})

  const updateResult =  createResult.right.update({description: "Article"})

  assertEquals(updateResult.isRight(), true)
  assertEquals(createResult.right.description, "Article")
})

Deno.test("ArticleNode.update should throw error if title is missing", () => {
  const createResult = ArticleNode.create({title: "Article test", owner: "user@domain.com", description: "Desc for Article"})

  const updateResult =  createResult.right.update({title: "", owner: "user@domain.com"})

  assertEquals(updateResult.isLeft(), true)
  assertInstanceOf(updateResult.value, ValidationError)
  assertInstanceOf((updateResult.value as ValidationError).errors[0], PropertyRequiredError)
  assertEquals((updateResult.value as ValidationError).errors[0].message, "Node.title is required")
})

Deno.test("ArticleNode.update should throw error if parent is missing", () => {
  const createResult = ArticleNode.create({title: "Article test", owner: "user@domain.com", description: "Desc for Article"})

  const updateResult =  createResult.right.update({parent: ""})

  assertEquals(updateResult.isLeft(), true)
  assertInstanceOf(updateResult.value, ValidationError)
  assertInstanceOf((updateResult.value as ValidationError).errors[0], PropertyRequiredError)
  assertEquals((updateResult.value as ValidationError).errors[0].message, "Node.parent is required")
})
