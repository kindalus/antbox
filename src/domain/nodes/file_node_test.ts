import { assert, assertEquals, assertInstanceOf, assertStrictEquals } from "@std/assert";
import { FileNode } from "./file_node.ts";
import { Folders } from "./folders.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Nodes } from "./nodes.ts";

Deno.test("FileNode.create should initialize", () => {
	const result = FileNode.create({
		title: "New file",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: "application/pdf",
	});

	assertStrictEquals(result.isRight(), true);
	const fileNode = result.right;
	assertEquals(Nodes.isFile(fileNode), true);
	assertEquals(fileNode.title, "New file");
	assertEquals(fileNode.parent, Folders.ROOT_FOLDER_UUID);
	assertEquals(fileNode.owner, "user@domain.com");
	assertEquals(fileNode.mimetype, "application/pdf");
});

Deno.test("FileNode.create should set the mimetype to 'application/javascript' if given 'text/javascript'", () => {
	const result = FileNode.create({
		title: "New file",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: "text/javascript",
	});
	assertStrictEquals(result.isRight(), true);
	const fileNode = result.right;
	assertEquals(fileNode.mimetype, "application/javascript");
});

Deno.test("FileNode.create should return error if mimetype is missing", () => {
	const result = FileNode.create({
		title: "New file",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
	});
	assertStrictEquals(result.isLeft(), true);
	assertInstanceOf(result.value, ValidationError);
});

Deno.test("FileNode.update should modify the title, fid, description and parent ", async () => {
	const createResult = FileNode.create({
		title: "Initial File",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
		mimetype: "application/pdf",
	});

	const fileNode = createResult.right;
	const initialModifiedTime = fileNode.modifiedTime;

	const timeout = (t: number) => new Promise((res) => setTimeout(() => res(undefined), t));
	await timeout(5);

	const updateResult = fileNode.update({
		title: "Updated File",
		fid: "new-fid",
		description: "Updated Description",
		parent: "new-parent",
	});

	assertStrictEquals(updateResult.isRight(), true);
	assertEquals(fileNode.title, "Updated File");
	assertEquals(fileNode.fid, "new-fid");
	assertEquals(fileNode.description, "Updated Description");
	assertEquals(fileNode.parent, "new-parent");
	assertStrictEquals(fileNode.modifiedTime > initialModifiedTime, true);
});

Deno.test("FileNode.update should throw error if title is missing", () => {
	const fileNodeOrErr = FileNode.create({
		title: "Initial File",
		mimetype: "application/javascript",
		owner: "user@domain.com",
	});

	assert(fileNodeOrErr.isRight());

	const result = fileNodeOrErr.right.update({ title: "" });

	assertStrictEquals(result.isLeft(), true);
	assertInstanceOf(result.value, ValidationError);
});
