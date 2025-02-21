import { expect, test } from "bun:test";
import { ValidationError } from "../../shared/validation_error.ts";
import { EmailFormatError } from "../nodes/email_format_error.ts";
import { Folders } from "../nodes/folders.ts";
import { Nodes } from "../nodes/nodes.ts";
import { PropertyRequiredError } from "../nodes/property_required_error.ts";
import { InvalidFullNameFormatError } from "./invalid_fullname_format_error.ts";
import { InvalidPasswordFormatError } from "./invalid_password_format_error.ts";
import { UserGroupRequiredError } from "./user_group_required_error.ts";
import { UserNode } from "./user_node.ts";

const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

test("UserNode.create should initialize", () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-pass",
    group: "users",
  });
  const user = createResult.right;

  expect(createResult.isRight()).toBe(true);
  expect(user.email).toBe(user.email);
  expect(user.title).toBe("Example User");
  expect(user.mimetype).toBe(Nodes.USER_MIMETYPE);
  expect(user.parent).toBe(Folders.USERS_FOLDER_UUID);
});

test("UserNode.create should throw error if secret has not the correct format", () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "se",
    group: "users",
  });

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect((createResult.value as ValidationError).errors[0]).toBeInstanceOf(
    InvalidPasswordFormatError
  );
});

test("UserNode.create should throw error if group is empty", async () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "",
  });

  await timeout(5);

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect((createResult.value as ValidationError).errors[0]).toBeInstanceOf(
    UserGroupRequiredError
  );
});

test("UserNode.create should throw error if owner is missing", () => {
  const createResult = UserNode.create({
    owner: "",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users",
  });

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect((createResult.value as ValidationError).errors[0]).toBeInstanceOf(
    PropertyRequiredError
  );
});

test("UserNode.create should throw error if title length less than 3 chars", async () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Ex",
    secret: "secret-password",
    group: "users",
  });

  await timeout(5);

  expect(createResult.isLeft()).toBe(true);
  expect(createResult.value).toBeInstanceOf(ValidationError);
  expect((createResult.value as ValidationError).errors[0]).toBeInstanceOf(
    InvalidFullNameFormatError
  );
});

test("UserNode.create should hash the secret with right shaSum ", async () => {
  const secret = "secret-password";
  const email = "user@domain.com";
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    title: "Example User",
    group: "users",
    email,
    secret,
  });

  const sha = await UserNode.shaSum(email, secret);

  await timeout(5);

  expect(createResult.isRight()).toBe(true);
  expect(createResult.right.secret).toBe(sha);
});

test("UserNode.update should throw error if new secret is invalid", async () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example user",
    secret: "secret-password",
    group: "users",
  });

  const updateResult = createResult.right.update({ secret: "ex" });

  await timeout(5);

  expect(updateResult.isLeft()).toBe(true);
  expect(updateResult.value).toBeInstanceOf(ValidationError);
  expect((updateResult.value as ValidationError).errors[0]).toBeInstanceOf(
    InvalidPasswordFormatError
  );
});

test("UserNode.update should modify secret and create a new hash", async () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example user",
    secret: "secret-password",
    group: "users",
  });
  const user = createResult.right;
  const sha = await UserNode.shaSum("user@domain.com", "example.com");
  const updateResult = user.update({ secret: "example.com" });
  await timeout(5);

  expect(updateResult.isRight()).toBe(true);
  expect(user.secret).toBe(sha);
});

test("UserNode.update should throw error if new email is invalid", () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example user",
    secret: "secret-password",
    group: "users",
  });

  const updateResult = createResult.right.update({ email: "example.com" });

  expect(updateResult.isLeft()).toBe(true);
  expect(updateResult.value).toBeInstanceOf(ValidationError);
  expect((updateResult.value as ValidationError).errors[0]).toBeInstanceOf(
    EmailFormatError
  );
});

test("UserNode.update should modify group, groups, title, description", async () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users",
    groups: ["bankers", "writers"],
  });
  const user = createResult.right;

  await timeout(5);
  const result = user.update({
    group: "admin",
    groups: [],
    title: "New Title",
    description: "New Desc",
  });

  expect(result.isRight()).toBe(true);
  expect(user.group).toBe("admin");
  expect(user.title).toBe("New Title");
  expect(user.description).toBe("New Desc");
  expect(user.groups).toStrictEqual([]);
});

test("UserNode.update should not modify parent ", async () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users",
  });

  await timeout(5);
  const updateResult = createResult.right.update({ parent: "--root--" });

  expect(updateResult.isRight()).toBe(true);
  expect(createResult.right.parent).toBe(Folders.USERS_FOLDER_UUID);
});

test("UserNode.update should not modify mimetype ", async () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users",
  });
  const user = createResult.right;

  await timeout(5);
  const updateResult = user.update({ mimetype: "image/jpg" });

  expect(updateResult.isRight()).toBe(true);
  expect(user.mimetype).toBe(Nodes.USER_MIMETYPE);
});
