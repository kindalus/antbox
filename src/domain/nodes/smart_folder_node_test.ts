import { describe, it } from "bdd";
import { expect } from "expect";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "./folders.ts";
import { Nodes } from "./nodes.ts";
import { SmartFolderNode } from "./smart_folder_node.ts";

describe("SmartFolderNode", () => {
	describe("create", () => {
		it("should initialize", () => {
			const result = SmartFolderNode.create({
				title: "New smart folder",
				parent: Folders.ROOT_FOLDER_UUID,
				owner: "user@domain.com",
				filters: [["title", "==", "example"]],
			});

			const smartFolderNode = result.right;
			expect(Nodes.isSmartFolder(smartFolderNode)).toBe(true);
			expect(smartFolderNode.title).toBe("New smart folder");
			expect(smartFolderNode.parent).toBe(Folders.ROOT_FOLDER_UUID);
			expect(smartFolderNode.owner).toBe("user@domain.com");
			expect(smartFolderNode.filters).toEqual([["title", "==", "example"]]);
		});

		it("should return error if filters is missing", () => {
			const result = SmartFolderNode.create({
				title: "New smart folder",
				parent: Folders.ROOT_FOLDER_UUID,
				owner: "user@domain.com",
			});

			expect(result.isLeft()).toBe(true);
			expect(result.value).toBeInstanceOf(ValidationError);
		});

		it("should not change createdTime", () => {
			const createResult = SmartFolderNode.create({
				title: "Initial smart folder",
				parent: Folders.ROOT_FOLDER_UUID,
				owner: "user@domain.com",
				filters: [["title", "==", "example"]],
			});
			const smartFolderNode = createResult.right;
			const createdTime = smartFolderNode.createdTime;

			// Update with valid new title and same group value
			smartFolderNode.update({
				title: "Another Title",
				filters: [["title", "==", "updated"]],
			});
			expect(smartFolderNode.createdTime).toBe(createdTime);
		});
	});

	describe("update", () => {
		it("should modify the title, fid, parent and filters", async () => {
			const createResult = SmartFolderNode.create({
				title: "Initial smart folder",
				parent: Folders.ROOT_FOLDER_UUID,
				owner: "user@domain.com",
				filters: [["title", "==", "example"]],
			});

			const smartFolderNode = createResult.right;
			const initialModifiedTime = smartFolderNode.modifiedTime;

			await new Promise((resolve) => setTimeout(resolve, 50));

			const updateResult = smartFolderNode.update({
				title: "Updated smart folder",
				parent: "new-parent",
				fid: "New fid",
				filters: [["title", "==", "updated"]],
			});

			expect(updateResult.isRight()).toBe(true);
			expect(smartFolderNode.title).toBe("Updated smart folder");
			expect(smartFolderNode.parent).toBe("new-parent");
			expect(smartFolderNode.fid).toBe("New fid");
			expect(smartFolderNode.filters).toEqual([["title", "==", "updated"]]);
			expect(smartFolderNode.modifiedTime > initialModifiedTime).toBe(true);
		});
	});

	describe("validation", () => {
		it("should return error if title is missing", () => {
			const smartFolderNodeOrErr = SmartFolderNode.create({
				title: "Initial smart folder",
				parent: Folders.ROOT_FOLDER_UUID,
				owner: "user@domain.com",
				filters: [["title", "==", "example"]],
			});

			expect(smartFolderNodeOrErr.isRight()).toBe(true);

			const result = smartFolderNodeOrErr.right.update({ title: "" });
			expect(result.isLeft()).toBe(true);
			expect(result.value).toBeInstanceOf(ValidationError);
		});

		it("should not update filters", () => {
			const createResult = SmartFolderNode.create({
				title: "Initial Smart Folder",
				parent: Folders.ROOT_FOLDER_UUID,
				owner: "user@domain.com",
				filters: [["title", "==", "example"]],
			});
			const smartFolderNode = createResult.right;

			const updateResult = smartFolderNode.update({
				filters: [],
			});
			expect(updateResult.isRight()).toBeFalsy();
			expect(smartFolderNode.filters).toEqual([["title", "==", "example"]]);
		});
	});
});
