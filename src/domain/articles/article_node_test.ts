import { assertEquals } from "@std/assert/equals";
import { assertInstanceOf } from "@std/assert/instance-of";
import { ValidationError } from "../../shared/validation_error.ts";
import { Nodes } from "../nodes/nodes.ts";
import { PropertyRequiredError } from "../nodes/property_required_error.ts";
import { ArticleNode } from "./article_node.ts";

Deno.test("ArticleNode should initialize", () => {
  const articleOrError = ArticleNode.create({title: "Article Test", owner: "user@domain.com", description: "Article description"})

  assertEquals(articleOrError.right.title, "Article Test")
  assertEquals(articleOrError.right.owner, "user@domain.com")
  assertEquals(articleOrError.right.description, "Article description")
  assertEquals(articleOrError.right.mimetype, Nodes.ARTICLE_MIMETYPE)
})

Deno.test("ArticleNode create should throw error if title is missing", () => {
  const articleOrError = ArticleNode.create({owner: "user@domain.com"})

  assertEquals(articleOrError.isLeft(), true)
  assertInstanceOf(articleOrError.value, ValidationError)
  assertEquals(articleOrError.value.message, "Node.title is required")
})

Deno.test("ArticleNode create should throw error if owner is missing", () => {
  const articleOrError = ArticleNode.create({title: "Article test", })

  assertEquals(articleOrError.isLeft(), true)
  assertInstanceOf(articleOrError.value, ValidationError)
  assertEquals(articleOrError.value.message, "Node.owner is required")
})

Deno.test("ArticleNode update should modify title", () => {
  const articleOrError = ArticleNode.create({title: "Article test", owner: "user@domain.com"})

  const result =  articleOrError.right.update({title: "Article"})

  assertEquals(result.isRight(), true)
  assertEquals(articleOrError.right.title, "Article")
})

Deno.test("ArticleNode update should modify description", () => {
  const articleOrError = ArticleNode.create({title: "Article test", owner: "user@domain.com", description: "Desc for Article"})

  const result =  articleOrError.right.update({description: "Article"})

  assertEquals(result.isRight(), true)
  assertEquals(articleOrError.right.description, "Article")
})

Deno.test("ArticleNode update should throw error if title is missing", () => {
  const articleOrError = ArticleNode.create({title: "Article test", owner: "user@domain.com", description: "Desc for Article"})

  const result =  articleOrError.right.update({title: "", owner: "user@domain.com"})

  assertEquals(result.isLeft(), true)
  assertInstanceOf(result.value, ValidationError)
  assertInstanceOf((result.value as ValidationError).errors[0], PropertyRequiredError)
  assertEquals((result.value as ValidationError).errors[0].message, "Node.title is required")
})

Deno.test("ArticleNode update should throw error if parent is missing", () => {
  const articleOrError = ArticleNode.create({title: "Article test", owner: "user@domain.com", description: "Desc for Article"})

  const result =  articleOrError.right.update({parent: ""})

  assertEquals(result.isLeft(), true)
  assertInstanceOf(result.value, ValidationError)
  assertInstanceOf((result.value as ValidationError).errors[0], PropertyRequiredError)
  assertEquals((result.value as ValidationError).errors[0].message, "Node.parent is required")
})

