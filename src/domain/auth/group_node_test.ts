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

Deno.test("GroupNode constructor should initialize", () => {
  const createResult = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group Test",
    description: "Test Group",
  });
  const group = createResult.right 

  assertEquals(group.owner, "root@antbox.io");
  assertEquals(group.title, "Group Test");
  assertEquals(group.mimetype, Nodes.GROUP_MIMETYPE);
  assertEquals(group.parent, Folders.GROUPS_FOLDER_UUID);
});

Deno.test(
  "GroupNode constructor should throw error if owner is missing",
  () => {
    const createResult = GroupNode.create({
      title: "Group Test",
      description: "Test Group",
    });

    assertStrictEquals(createResult.isLeft(), true);
    assertInstanceOf(createResult.value, ValidationError);
    assertInstanceOf(createResult.value.errors[0], PropertyRequiredError);
    assertEquals(createResult.value.errors[0].message, "Node.owner is required");
  }
);

Deno.test(
  "GroupNode constructor should throw error if owner is invalid email format",
  () => {
    const createResult = GroupNode.create({
      owner: "user@examplecom",
      title: "Group Test",
      description: "Test Group",
    });

    assertStrictEquals(createResult.isLeft(), true);
    assertInstanceOf(createResult.value, ValidationError);
    assertInstanceOf(createResult.value.errors[0], EmailFormatError);
  }
);

Deno.test(
  "GroupNode constructor should throw error if title is missing",
  () => {
    const createResult = GroupNode.create({
      owner: "root@antbox.io",
      description: "Test Group",
    });

    assertStrictEquals(createResult.isLeft(), true);
    assertInstanceOf(createResult.value, ValidationError);
    assertInstanceOf(createResult.value.errors[0], PropertyRequiredError);
    assertEquals(createResult.value.errors[0].message, "Node.title is required");
  }
);

Deno.test(
  "GroupNode constructor should throw error if title lenght is less than 3 chars",
  () => {
    const createResult = GroupNode.create({
      title: "Gr",
      owner: "root@antbox.io",
      description: "Test Group",
    });

    assertStrictEquals(createResult.isLeft(), true);
    assertInstanceOf(createResult.value, ValidationError);
    assertInstanceOf(createResult.value.errors[0], InvalidFullNameFormatError);
  }
);

Deno.test("GroupNode.update should modify title and description", () => {
  const createResult = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group",
    description: "Test Group",
  });

  const result = createResult.right.update({
    title: "Group-2",
    description: "Desc 2",
  });

  assertStrictEquals(result.isRight(), true);
  assertStrictEquals(createResult.right.title, "Group-2");
  assertStrictEquals(createResult.right.description, "Desc 2");
});

Deno.test("GroupNode.update should not modify parent ", () => {
  const group = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group",
    description: "Test Group",
  });

  const result = group.right.update({ parent: "--root--" });

  assertStrictEquals(result.isRight(), true);
  assertStrictEquals(group.right.parent, Folders.GROUPS_FOLDER_UUID);
  
});

Deno.test("GroupNode.update should not modify mimetype ", () => {
  const group = GroupNode.create({
    owner: "root@antbox.io",
    title: "Group",
    description: "Test Group",
  });

  const result = group.right.update({ mimetype: "image/jpg" });

  assertStrictEquals(result.isRight(), true);
  assertStrictEquals(group.right.mimetype, Nodes.GROUP_MIMETYPE)
});
