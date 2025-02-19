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

Deno.test("FolderNode.update should modify the title, fid, description, permissions and parent ", async () => {
	const createResult = FolderNode.create({
		title: "Initial Folder",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
		group: "group-1",
	});
	const folderNode = createResult.right;
	const initialModifiedTime = folderNode.modifiedTime;

	const timeout = (t: number) => new Promise((res) => setTimeout(() => res(undefined), t));
	await timeout(5);

	const updateResult = folderNode.update({
		title: "Updated Folder",
		fid: "new-fid",
		description: "new description",
		permissions: {
			group: ["Read"],
			authenticated: [],
			anonymous: [],
			advanced: {
				"custom-group": ["Read", "Write"],
			},
		},
		parent: "new-parent",
	});

	assertStrictEquals(updateResult.isRight(), true);
	assertEquals(folderNode.title, "Updated Folder");
	assertEquals(folderNode.fid, "new-fid");
	assertEquals(folderNode.description, "new description");
	assertEquals(folderNode.permissions.group, ["Read"]);
	assertEquals(folderNode.permissions.authenticated, []);
	assertEquals(folderNode.permissions.anonymous, []);
	assertEquals(folderNode.permissions.advanced["custom-group"], ["Read", "Write"]);
	assertEquals(folderNode.parent, "new-parent");
	assertStrictEquals(folderNode.modifiedTime !== initialModifiedTime, true);
});

Deno.test("FolderNode.update should not change createdTime", () => {
	const createResult = FolderNode.create({
		title: "Initial Folder",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
		group: "group-1",
	});
	const folderNode = createResult.right;
	const createdTime = folderNode.createdTime;

	// Update with valid new title and same group value
	folderNode.update({ title: "Another Title", group: "group-1" });
	assertEquals(folderNode.createdTime, createdTime);
});

Deno.test("FolderNode.update should return error if update results in invalid title", () => {
	const createResult = FolderNode.create({
		title: "Valid title",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
		group: "group-1",
	});
	const folderNode = createResult.right;

	const updateResult = folderNode.update({ title: "" });
	assertStrictEquals(updateResult.isLeft(), true);
	assertInstanceOf(updateResult.value, ValidationError);
});

Deno.test("FolderNode.update should not update group", () => {
	const createResult = FolderNode.create({
		title: "Valid Folder",
		parent: Folders.ROOT_FOLDER_UUID,
		owner: "user@domain.com",
		group: "group-1",
	});
	const folderNode = createResult.right;

	const updateResult = folderNode.update({ group: "group-2" });
	assertStrictEquals(updateResult.isRight(), true);
	assertEquals(folderNode.group, "group-1");
});
