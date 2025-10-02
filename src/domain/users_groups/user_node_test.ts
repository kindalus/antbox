import { test } from "bdd";
import { expect } from "expect";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { PropertyFormatError, PropertyRequiredError } from "domain/nodes/property_errors.ts";
import { ValidationError } from "shared/validation_error.ts";
import { UserNode } from "./user_node.ts";

const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("UserNode.create should initialize", () => {
	const createResult = UserNode.create({
		owner: "root@antbox.io",
		email: "user@domain.com",
		title: "Example User",
		group: "users",
	});
	const user = createResult.right;

	expect(createResult.isRight()).toBe(true);
	expect(user.email).toBe(user.email);
	expect(user.title).toBe("Example User");
	expect(user.mimetype).toBe(Nodes.USER_MIMETYPE);
	expect(user.parent).toBe(Folders.USERS_FOLDER_UUID);
});

test("UserNode.create should throw error if group is missing", () => {
	const result = UserNode.create({
		owner: "root@antbox.io",
		email: "user@domain.com",
		title: "Example User",
		group: "",
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
	expect(
		(result.value as ValidationError).has(PropertyRequiredError.ERROR_CODE),
	).toBeTruthy();
});

test("UserNode.create should throw error if owner is missing", () => {
	const result = UserNode.create({
		owner: "",
		email: "user@domain.com",
		title: "Example User",
		group: "users",
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
	expect((result.value as ValidationError).has(PropertyFormatError.ERROR_CODE))
		.toBeTruthy();
});

test("UserNode.create should throw error if title length less than 3 chars", () => {
	const result = UserNode.create({
		owner: "root@antbox.io",
		email: "user@domain.com",
		title: "Ex",
		group: "users",
	});

	expect(result.isLeft()).toBe(true);
	expect(result.value).toBeInstanceOf(ValidationError);
	expect((result.value as ValidationError).has(PropertyFormatError.ERROR_CODE))
		.toBeTruthy();
});

test("UserNode.update should modify group, groups, title and description", () => {
	const createResult = UserNode.create({
		owner: "root@antbox.io",
		email: "user@domain.com",
		title: "Example User",
		group: "users",
		groups: ["bankers", "writers"],
	});
	const user = createResult.right;

	const result = user.update({
		group: "admin",
		groups: [],
		title: "New Title",
		description: "New Desc",
	});

	expect(result.isRight(), result.value?.message).toBe(true);
	expect(user.group).toBe("admin");
	expect(user.title).toBe("New Title");
	expect(user.description).toBe("New Desc");
	expect(user.groups).toStrictEqual([]);
});

test("UserNode.update should not modify parent", () => {
	const createResult = UserNode.create({
		owner: "root@antbox.io",
		email: "user@domain.com",
		title: "Example User",
		group: "users",
	});

	const updateResult = createResult.right.update({ parent: "--root--" });

	expect(updateResult.isRight()).toBe(true);
	expect(createResult.right.parent).toBe(Folders.USERS_FOLDER_UUID);
});

test("UserNode.update should not modify mimetype", () => {
	const createResult = UserNode.create({
		owner: "root@antbox.io",
		email: "user@domain.com",
		title: "Example User",
		group: "users",
	});
	const user = createResult.right;

	const updateResult = user.update({ mimetype: "image/jpg" });

	expect(updateResult.isRight()).toBe(true);
	expect(user.mimetype).toBe(Nodes.USER_MIMETYPE);
});

test("UserNode.update should not modify email", async () => {
	const createResult = UserNode.create({
		owner: "root@antbox.io",
		email: "user@domain.com",
		title: "Example User",
		group: "users",
	});
	const user = createResult.right;

	await timeout(5);
	const updateResult = user.update({ email: "johndoe@gmail.com" });

	expect(updateResult.isRight()).toBe(true);
	expect(user.email).toBe("user@domain.com");
});
