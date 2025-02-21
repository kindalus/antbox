import { expect, test } from "bun:test";
import { ValidationError } from "../../shared/validation_error.ts";
import { Nodes } from "../nodes/nodes.ts";
import { PropertyRequiredError } from "../nodes/property_required_error.ts";
import { ArticleNode } from "./article_node.ts";

test("ArticleNode.create should initialize", () => {
  const createResult = ArticleNode.create({
    title: "Article Test",
    owner: "user@domain.com",
    description: "Article description",
  });

  expect(createResult.isRight()).toBe(true);
  const article = createResult.right;
  expect(article.title).toBe("Article Test");
  expect(article.owner).toBe("user@domain.com");
  expect(article.description).toBe("Article description");
  expect(article.mimetype).toBe(Nodes.ARTICLE_MIMETYPE);
});

test("ArticleNode.create should throw error if title is missing", () => {
  const createResult = ArticleNode.create({ owner: "user@domain.com" });

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect(createResult.value.message).toBe("Node.title is required");
});

test("ArticleNode.create should throw error if owner is missing", () => {
  const createResult = ArticleNode.create({ title: "Article test" });

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect(createResult.value.message).toBe("Node.owner is required");
});

test("ArticleNode.update should modify title", () => {
  const createResult = ArticleNode.create({
    title: "Article test",
    owner: "user@domain.com",
  });

  const updateResult = createResult.right.update({ title: "Article" });

  expect(updateResult.isRight()).toBe(true);
  expect(createResult.right.title).toBe("Article");
});

test("ArticleNode.update should modify description", () => {
  const createResult = ArticleNode.create({
    title: "Article test",
    owner: "user@domain.com",
    description: "Desc for Article",
  });

  const updateResult = createResult.right.update({ description: "Article" });

  expect(updateResult.isRight()).toBe(true);
  expect(createResult.right.description).toBe("Article");
});

test("ArticleNode.update should throw error if title is missing", () => {
  const createResult = ArticleNode.create({
    title: "Article test",
    owner: "user@domain.com",
    description: "Desc for Article",
  });

  const updateResult = createResult.right.update({
    title: "",
    owner: "user@domain.com",
  });

  expect(updateResult.isLeft()).toBe(true);
  expect(updateResult.value).toBeInstanceOf(ValidationError);
  expect((updateResult.value as ValidationError).errors[0]).toBeInstanceOf(
    PropertyRequiredError
  );
  expect((updateResult.value as ValidationError).errors[0].message).toBe(
    "Node.title is required"
  );
});

test("ArticleNode.update should throw error if parent is missing", () => {
  const createResult = ArticleNode.create({
    title: "Article test",
    owner: "user@domain.com",
    description: "Desc for Article",
  });

  const updateResult = createResult.right.update({ parent: "" });

  expect(updateResult.isLeft()).toBe(true);
  expect(updateResult.value).toBeInstanceOf(ValidationError);
  expect((updateResult.value as ValidationError).errors[0]).toBeInstanceOf(
    PropertyRequiredError
  );
  expect((updateResult.value as ValidationError).errors[0].message).toBe(
    "Node.parent is required"
  );
});
