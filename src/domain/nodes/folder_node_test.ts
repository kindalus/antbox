import { assertEquals, assertInstanceOf, assertStrictEquals } from "@std/assert";
import { FolderNode } from "./folder_node.ts";
import { Folders } from "./folders.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import { Nodes } from "./nodes.ts";

Deno.test("FolderNode.create should initialize", () => {
	const result = FolderNode.create({
		title: "New folder",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
		group: "group-1",
	});

	assertStrictEquals(result.isRight(), true);
	const folderNode = result.right;
	assertEquals(Nodes.isFolder(folderNode), true);
	assertEquals(folderNode.title, "New folder");
	assertEquals(folderNode.parent, Folders.ROOT_FOLDER_UUID);
	assertEquals(folderNode.owner, "user@domain.com");
	assertEquals(folderNode.group, "group-1");
});

Deno.test("FolderNode.create should return error if group is missing", () => {
	const result = FolderNode.create({
		title: "New folder",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domianl.com",
	});
	assertStrictEquals(result.isLeft(), true);
	assertInstanceOf(result.value, ValidationError);
});

Deno.test("FolderNode.create should always have application/vnd.antbox.folder mimetype", () => {
	const result = FolderNode.create({
		title: "Title",
		mimetype: "application/json",
		owner: "user@domain.com",
		parent: Folders.ROOT_FOLDER_UUID,
		group: "group-1",
	});

	assertStrictEquals(result.isRight(), true);
	assertEquals(result.right.mimetype, Nodes.FOLDER_MIMETYPE);
});
