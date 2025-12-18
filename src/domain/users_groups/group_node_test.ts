import { describe, it } from "bdd";
import { expect } from "expect";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { GroupNode } from "./group_node.ts";
import { PropertyFormatError, PropertyRequiredError } from "domain/nodes/property_errors.ts";

describe("GroupNode", () => {
	describe("create", () => {
		it("should initialize", () => {
			const createResult = GroupNode.create({
				owner: "root@antbox.io",
				title: "Group Test",
				description: "Test Group",
			});
			const group = createResult.right;

			expect(group.owner).toBe("root@antbox.io");
			expect(group.title).toBe("Group Test");
			expect(group.mimetype).toBe(Nodes.GROUP_MIMETYPE);
			expect(group.parent).toBe(Folders.GROUPS_FOLDER_UUID);
		});

		it("should throw error if owner is missing", () => {
			const createResult = GroupNode.create({
				title: "Group Test",
				description: "Test Group",
			});

			expect(createResult.isLeft()).toBe(true);
			expect(createResult.value).toBeInstanceOf(ValidationError);
			expect(
				(createResult.value as ValidationError).has(
					PropertyRequiredError.ERROR_CODE,
				),
			).toBe(true);
		});

		it("should throw error if owner is invalid email format", () => {
			const createResult = GroupNode.create({
				owner: "user@examplecom",
				title: "Group Test",
				description: "Test Group",
			});

			expect(createResult.isLeft()).toBe(true);
			expect(createResult.value).toBeInstanceOf(ValidationError);
			expect(
				(createResult.value as ValidationError).has(PropertyFormatError.ERROR_CODE),
			).toBe(true);
		});

		it("should throw error if title is missing", () => {
			const createResult = GroupNode.create({
				owner: "root@antbox.io",
				description: "Test Group",
			});

			expect(createResult.isLeft()).toBe(true);
			expect(createResult.value).toBeInstanceOf(ValidationError);
			expect(
				(createResult.value as ValidationError).has(
					PropertyRequiredError.ERROR_CODE,
				),
			);
		});

		it("should throw error if title lenght is less than 3 chars", () => {
			const createResult = GroupNode.create({
				title: "Gr",
				owner: "root@antbox.io",
				description: "Test Group",
			});

			expect(createResult.isLeft()).toBe(true);
			expect(createResult.value).toBeInstanceOf(ValidationError);
			expect(
				(createResult.value as ValidationError).has(PropertyFormatError.ERROR_CODE),
			);
		});
	});

	describe("update", () => {
		it("should modify title and description", () => {
			const createResult = GroupNode.create({
				owner: "root@antbox.io",
				title: "Group",
				description: "Test Group",
			});

			const result = createResult.right.update({
				title: "Group-2",
				description: "Desc 2",
			});

			expect(result.isRight(), result.value?.message).toBe(true);
			expect(createResult.right.title).toBe("Group-2");
			expect(createResult.right.description).toBe("Desc 2");
		});

		it("should not modify parent ", () => {
			const group = GroupNode.create({
				owner: "root@antbox.io",
				title: "Group",
				description: "Test Group",
			});

			const result = group.right.update({ parent: "--root--" });

			expect(result.isRight(), result.value?.message).toBe(true);
			expect(group.right.parent).toBe(Folders.GROUPS_FOLDER_UUID);
		});

		it("should not modify mimetype ", () => {
			const group = GroupNode.create({
				owner: "root@antbox.io",
				title: "Group",
				description: "Test Group",
			});

			const result = group.right.update({ mimetype: "image/jpg" });

			expect(result.isRight(), result.value?.message).toBe(true);
			expect(group.right.mimetype).toBe(Nodes.GROUP_MIMETYPE);
		});
	});
});
