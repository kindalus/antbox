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
import { UserGroupRequiredError } from "./user_group_required_error.ts";
import { UserNode } from "./user_node.ts";

const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

Deno.test("UserNode constructor should initialize", () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-pass",
    group: "users",
  });
  const user = createResult.right 

  assertEquals(createResult.isRight(), true);
  assertEquals(user.email, user.email);
  assertEquals(user.title, "Example User");
  assertEquals(user.mimetype, Nodes.USER_MIMETYPE);
  assertEquals(user.parent, Folders.USERS_FOLDER_UUID);
});

Deno.test(
  "UserNode constructor should throw error if secret has not the correct format",
  () => {
    const createResult = UserNode.create({
      owner: "root@antbox.io",
      email: "user@domain.com",
      title: "Example User",
      secret: "se",
      group: "users",
    });

    assertEquals(createResult.isLeft(), true);
    assertInstanceOf(createResult.value, ValidationError);
    assertInstanceOf(createResult.value.errors[0], InvalidPasswordFormatError);
  }
);

Deno.test(
  "UserNode constructor should throw error if group is empty",
  async () => {
    const createResult = UserNode.create({
      owner: "root@antbox.io",
      email: "user@domain.com",
      title: "Example User",
      secret: "secret-password",
      group: "",
    });

    await timeout(5);

    assertEquals(createResult.isLeft(), true);
    assertInstanceOf(createResult.value, ValidationError);
    assertInstanceOf(createResult.value.errors[0], UserGroupRequiredError);
  }
);

Deno.test("UserNode constructor should throw error if owner is missing", () => {
  const createResult = UserNode.create({
    owner: "",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users",
  });

  assertEquals(createResult.isLeft(), true);
  assertInstanceOf(createResult.value, ValidationError);
  assertInstanceOf(createResult.value.errors[0], PropertyRequiredError);
});

Deno.test(
  "UserNode constructor should throw error if title length less than 3 chars",
  async () => {
    const createResult = UserNode.create({
      owner: "root@antbox.io",
      email: "user@domain.com",
      title: "Ex",
      secret: "secret-password",
      group: "users",
    });

    await timeout(5);

    assertEquals(createResult.isLeft(), true);
    assertInstanceOf(createResult.value, ValidationError);
    assertInstanceOf(createResult.value.errors[0], InvalidFullNameFormatError);
  }
);

Deno.test(
  "UserNode constructor should hash the secret with right shaSum ",
  async () => {
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

    assertStrictEquals(createResult.isRight(), true);
    assertEquals(createResult.right.secret, sha);
  }
);

Deno.test(
  "UserNode.update should throw error if new secret is invalid",
  async () => {
    const createResult = UserNode.create({
      owner: "root@antbox.io",
      email: "user@domain.com",
      title: "Example user",
      secret: "secret-password",
      group: "users",
    });

    const updateResult = createResult.right.update({ secret: "ex" });

    await timeout(5);

    assertStrictEquals(updateResult.isLeft(), true);
    assertInstanceOf(updateResult.value, ValidationError);
    assertInstanceOf(updateResult.value.errors[0], InvalidPasswordFormatError);
  }
);

Deno.test(
  "UserNode.update should modify secret and create a new hash",
  async () => {
    const createResult = UserNode.create({
      owner: "root@antbox.io",
      email: "user@domain.com",
      title: "Example user",
      secret: "secret-password",
      group: "users",
    });
    const user = createResult.right
    const sha = await UserNode.shaSum("user@domain.com", "example.com");
    const updateResult = user.update({ secret: "example.com" });
    await timeout(5);

    assertStrictEquals(updateResult.isRight(), true);
    assertStrictEquals(user.secret, sha);
  }
);

Deno.test("UserNode.update should throw error if new email is invalid", () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example user",
    secret: "secret-password",
    group: "users",
  });

  const updateResult = createResult.right.update({ email: "example.com" });

  assertStrictEquals(updateResult.isLeft(), true);
  assertInstanceOf(updateResult.value, ValidationError);
  assertInstanceOf(updateResult.value.errors[0], EmailFormatError);
});

Deno.test(
  "UserNode.update should modify group, groups, title, description",
 async () => {
    const createResult = UserNode.create({
      owner: "root@antbox.io",
      email: "user@domain.com",
      title: "Example User",
      secret: "secret-password",
      group: "users",
      groups: ["bankers", "writers"],
    });
    const user = createResult.right

    await timeout(5)
    const result = user.update({
      group: "admin",
      groups: [],
      title: "New Title",
      description: "New Desc",
    });

    assertStrictEquals(result.isRight(), true);
    assertStrictEquals(user.group, "admin");
    assertStrictEquals(user.title, "New Title");
    assertStrictEquals(user.description, "New Desc");
    assertEquals(user.groups, []);
  }
);

Deno.test("UserNode.update should not modify parent ", async () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users",
  });

  await timeout(5)
  const updateResult = createResult.right.update({ parent: "--root--" });

  assertStrictEquals(updateResult.isRight(), true);
  assertEquals(createResult.right.parent, Folders.USERS_FOLDER_UUID)
});

Deno.test("UserNode.update should not modify mimetype ", async () => {
  const createResult = UserNode.create({
    owner: "root@antbox.io",
    email: "user@domain.com",
    title: "Example User",
    secret: "secret-password",
    group: "users",
  });
  const user = createResult.right
  
  await timeout(5)
  const updateResult = user.update({ mimetype: "image/jpg" });

  assertStrictEquals(updateResult.isRight(), true);
  assertStrictEquals(user.mimetype, Nodes.USER_MIMETYPE)
});
