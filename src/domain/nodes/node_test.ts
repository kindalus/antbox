import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import { Node } from "./node.ts";
import { Folders } from "./folders.ts";
import { assertInstanceOf } from "@std/assert/instance-of";
import { ValidationError } from "../../shared/validation_error.ts";

Deno.test("Node constructor should initialize", () => {
	const node = new Node({
		title: "New node",
		mimetype: "application/json",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
	});

	assertEquals(node.title, "New node");
	assertEquals(node.mimetype, "application/json");
	assertEquals(node.parent, Folders.ROOT_FOLDER_UUID);
	assertEquals(node.owner, "user@domain.com");
});

Deno.test("Node constructor should throw error if title is missing", () => {
	assertThrows(() =>
		new Node({
			title: "",
			mimetype: "application/json",
			owner: "user",
			parent: Folders.ROOT_FOLDER_UUID,
		})
	);
});

Deno.test("Node construtor should throw error if mimetype is missing", () => {
	assertThrows(() =>
		new Node({
			title: "Title",
			mimetype: "",
			owner: "user",
			parent: Folders.ROOT_FOLDER_UUID,
		})
	);
});

Deno.test("Node constructor should throw error if parent is missing", () => {
	assertThrows(() =>
		new Node({
			title: "Title",
			mimetype: "application/json",
			owner: "user",
			parent: "",
		})
	);
});

Deno.test("Node constructor should throw error if owner is missing", () => {
	assertThrows(() =>
		new Node({
			title: "Title",
			mimetype: "application/json",
			owner: "",
			parent: Folders.ROOT_FOLDER_UUID,
		})
	);
});

Deno.test("Node update should modify the title and description", () => {
	const node = new Node({
		title: "Initial Title",
		description: "Initial Description",
		mimetype: "application/pdf",
		owner: "user@domain.com",
	});

	node.update({
		title: "Updated Title",
		description: "Updated Description",
		owner: "user@domain.com",
	});
	assertEquals(node.title, "Updated Title");
	assertEquals(node.description, "Updated Description");
});

Deno.test("Node update should not modify the createdTime", () => {
	const node = new Node({
		title: "Initial Title",
		mimetype: "text/plain",
		owner: "user@domain.com",
	});
	const createdTime = node.createdTime;
	node.update({ title: "Updated Title" });
	assertEquals(node.createdTime, createdTime);
});

Deno.test("Node update should throw error if title is missing", () => {
	const node = new Node({
		title: "Initial Title",
		mimetype: "application/javascript",
		owner: "user@domain.com",
	});

	const result = node.update({ title: "" });

	assertStrictEquals(result.isLeft(), true);
	assertInstanceOf(result.value, ValidationError);
});

Deno.test("Node update should throw error if parent is missing", () => {
	const node = new Node({
		title: "Initial Title",
		mimetype: "application/javascript",
		owner: "user@domain.com",
	});

	const result = node.update({ parent: "" });

	assertStrictEquals(result.isLeft(), true);
	assertInstanceOf(result.value, ValidationError);
});

Deno.test("Node update should modify the modifiedTime", async () => {
	const node = new Node({
		title: "Initial Title",
		mimetype: "application/pdf",
		owner: "user@domain.com",
	});
	const initialModifiedTime = node.modifiedTime;

	const timeout = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
	await timeout(5);

	node.update({ title: "Updated Title" });
	assertStrictEquals(node.modifiedTime !== initialModifiedTime, true);
});
