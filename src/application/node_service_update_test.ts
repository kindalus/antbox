import { describe, it } from "bdd";
import { expect } from "expect";
import { NodeService } from "./node_service.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { FileNode } from "domain/nodes/file_node.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import type { AspectProperties } from "domain/aspects/aspect_node.ts";
import { ValidationError } from "shared/validation_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import type { FolderNode } from "domain/nodes/folder_node.ts";

describe("NodeService.update", () => {
	it("should update the node metadata", async () => {
		const service = nodeService();
		const nodeOrErr = await service.create(authCtx, {
			title: "Initial Title",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			title: "Updated Title",
			description: "Updated Description",
		});

		expect(updateOrErr.isRight(), errToMsg(updateOrErr.value)).toBeTruthy();

		const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
		expect(updatedNodeOrErr.isRight(), errToMsg(updatedNodeOrErr.value))
			.toBeTruthy();
		expect(updatedNodeOrErr.right.title).toBe("Updated Title");
		expect(updatedNodeOrErr.right.description).toBe("Updated Description");
	});

	it("should return error if node is not found", async () => {
		const service = nodeService();
		const updateOrErr = await service.update(authCtx, "not-found", {
			title: "Updated Title",
		});

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(NodeNotFoundError);
	});

	it("should return error if user doesn't have 'Write' permission on parent", async () => {
		const service = nodeService();
		const parent = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: "application/vnd.antbox.folder",
			permissions: {
				anonymous: [],
				group: ["Read"],
				authenticated: ["Read"],
				advanced: {},
			},
		});

		const node = await service.create(authCtx, {
			title: "Node",
			mimetype: "application/json",
			parent: parent.right.uuid,
		});

		const ctx: AuthenticationContext = {
			mode: "Direct",
			tenant: "",
			principal: { email: "otheruser@domain.com", groups: ["group-x"] },
		};

		const updateOrErr = await service.update(ctx, node.right.uuid, {
			title: "Updated Title",
		});

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(ForbiddenError);
	});

	it("should not update mimetype", async () => {
		const service = nodeService();
		const parentOrErr = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const nodeOrErr = await service.create(authCtx, {
			title: "Node with Mimetype",
			mimetype: Nodes.META_NODE_MIMETYPE,
			parent: parentOrErr.right.uuid,
		});

		const updateResult = await service.update(authCtx, nodeOrErr.right.uuid, {
			title: "Updated Title",
			mimetype: "application/json",
		});

		expect(updateResult.isRight(), errToMsg(updateResult.value)).toBeTruthy();

		const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
		expect(updatedNodeOrErr.isRight(), errToMsg(updatedNodeOrErr.value))
			.toBeTruthy();
		expect(updatedNodeOrErr.right.title).toBe("Updated Title");
		expect(updatedNodeOrErr.right.mimetype).toBe(Nodes.META_NODE_MIMETYPE);
	});

	it("should return an error if edition is inconsistent with node aspects", async () => {
		const service = nodeService();

		const props: AspectProperties = [{
			name: "amount",
			title: "Amount",
			type: "number",
		}];

		// Create aspect with number property type
		const _aspectOrErr = await service.create(authCtx, {
			uuid: "invoice",
			title: "Invoice",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with valid aspect
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["invoice"],
			properties: {
				"invoice:amount": 1000,
			},
		});

		// Try to update node with invalid property value type
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"invoice:amount": "Invalid value", // Should be number, not string
			},
		});

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(ValidationError);
	});

	it("should return an error if edition turns node unacceptable to parent restrictions", async () => {
		const service = nodeService();

		// Create a file node in a regular folder first
		const parentOrErr = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const file = new File(["content"], "file.txt", { type: "text/plain" });
		const nodeOrErr = await service.createFile(authCtx, file, {
			parent: parentOrErr.right.uuid,
		});

		// Try to move the file node to root folder (which doesn't accept files)
		// by updating its parent to root - this should violate parent restrictions
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			parent: Folders.ROOT_FOLDER_UUID, // Root folder restrictions should reject files
		});

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(BadRequestError);
	});

	it("should fail if updated childFilters make any existing child node invalid", async () => {
		const service = nodeService();

		// Create a folder without any filters
		const folderOrErr = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		expect(folderOrErr.isRight()).toBeTruthy();

		// Create a file node in the folder (should succeed with no filters)
		const file = new File(["content"], "document.txt", { type: "text/plain" });
		const childOrErr = await service.createFile(authCtx, file, {
			title: "Child File",
			parent: folderOrErr.right.uuid,
		});
		expect(childOrErr.isRight()).toBeTruthy();

		// Now try to update the folder to add filters that would reject the existing file
		// (only allow folders, but we have a file as child)
		const updateOrErr = await service.update(authCtx, folderOrErr.right.uuid, {
			filters: [["mimetype", "==", Nodes.FOLDER_MIMETYPE]],
		});

		// The update should fail because existing child violates new filters
		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(BadRequestError);
	});

	it("should succeed if updated childFilters are satisfied by all existing children", async () => {
		const service = nodeService();

		// Create a folder without any filters
		const folderOrErr = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		expect(folderOrErr.isRight()).toBeTruthy();

		// Create a child folder in the parent folder
		const childFolderOrErr = await service.create(authCtx, {
			title: "Child Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: folderOrErr.right.uuid,
		});
		expect(childFolderOrErr.isRight()).toBeTruthy();

		// Now update the parent folder to add filters that accept folders (which should succeed)
		const updateOrErr = await service.update(authCtx, folderOrErr.right.uuid, {
			filters: [["mimetype", "==", Nodes.FOLDER_MIMETYPE]],
		});

		// The update should succeed because existing child satisfies new filters
		expect(updateOrErr.isRight()).toBeTruthy();
	});

	it("should ignore readonly properties during node updates", async () => {
		const service = nodeService();

		const props: AspectProperties = [{
			name: "readonly_field",
			title: "Readonly Field",
			type: "string",
			readonly: true,
			default: "initial_value",
		}, {
			name: "editable_field",
			title: "Editable Field",
			type: "string",
		}];

		// Create aspect with readonly property
		const _aspectOrErr = await service.create(authCtx, {
			uuid: "readonly-aspect",
			title: "Readonly Aspect",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with aspect
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["readonly-aspect"],
			properties: {
				"readonly-aspect:readonly_field": "initial_value",
				"readonly-aspect:editable_field": "initial_editable",
			},
		});

		expect(nodeOrErr.isRight()).toBeTruthy();

		// Try to update both readonly and editable properties
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"readonly-aspect:readonly_field": "attempted_change", // Should be ignored
				"readonly-aspect:editable_field": "updated_editable", // Should be updated
			},
		});

		expect(updateOrErr.isRight()).toBeTruthy();

		// Verify the readonly property was not changed and editable property was updated
		const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
		expect(updatedNodeOrErr.isRight()).toBeTruthy();

		const updatedNode = updatedNodeOrErr.right as FolderNode;

		// Readonly property should keep original value
		expect(updatedNode.properties["readonly-aspect:readonly_field"])
			.toBe("initial_value");
		// Editable property should have new value
		expect(updatedNode.properties["readonly-aspect:editable_field"])
			.toBe("updated_editable");
	});

	it("should ignore readonly properties when they are the only properties being updated", async () => {
		const service = nodeService();

		const props: AspectProperties = [{
			name: "readonly_only",
			title: "Readonly Only",
			type: "number",
			readonly: true,
			default: 42,
		}];

		// Create aspect with only readonly property
		const _aspectOrErr = await service.create(authCtx, {
			uuid: "readonly-only-aspect",
			title: "Readonly Only Aspect",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with aspect
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["readonly-only-aspect"],
			properties: {
				"readonly-only-aspect:readonly_only": 42,
			},
		});

		expect(nodeOrErr.isRight()).toBeTruthy();

		// Try to update only readonly property
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"readonly-only-aspect:readonly_only": 999, // Should be ignored
			},
		});

		expect(updateOrErr.isRight()).toBeTruthy();

		// Verify the readonly property was not changed
		const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
		expect(updatedNodeOrErr.isRight()).toBeTruthy();

		const updatedNode = updatedNodeOrErr.right as FolderNode;
		expect(
			updatedNode.properties["readonly-only-aspect:readonly_only"],
		).toBe(42);
	});

	it("should handle mixed readonly and non-readonly properties across multiple aspects", async () => {
		const service = nodeService();

		const aspect1Props: AspectProperties = [{
			name: "readonly_prop",
			title: "Readonly Property",
			type: "string",
			readonly: true,
			default: "readonly_default",
		}];

		const aspect2Props: AspectProperties = [{
			name: "editable_prop",
			title: "Editable Property",
			type: "string",
		}];

		// Create two aspects
		await service.create(authCtx, {
			uuid: "aspect-with-readonly",
			title: "Aspect With Readonly",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: aspect1Props,
		});

		await service.create(authCtx, {
			uuid: "aspect-with-editable",
			title: "Aspect With Editable",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: aspect2Props,
		});

		// Create node with both aspects
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["aspect-with-readonly", "aspect-with-editable"],
			properties: {
				"aspect-with-readonly:readonly_prop": "readonly_default",
				"aspect-with-editable:editable_prop": "initial_editable",
			},
		});

		expect(nodeOrErr.isRight()).toBeTruthy();

		// Try to update properties from both aspects
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"aspect-with-readonly:readonly_prop": "should_be_ignored",
				"aspect-with-editable:editable_prop": "should_be_updated",
			},
		});

		expect(updateOrErr.isRight()).toBeTruthy();

		// Verify results
		const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
		expect(updatedNodeOrErr.isRight()).toBeTruthy();

		const updatedNode = updatedNodeOrErr.right as FolderNode;

		expect(
			updatedNode.properties["aspect-with-readonly:readonly_prop"],
		).toBe("readonly_default");
		expect(
			updatedNode.properties["aspect-with-editable:editable_prop"],
		).toBe("should_be_updated");
	});
});

describe("NodeService.updateFile", () => {
	it("should update file content and metadata", async () => {
		const service = nodeService();
		const parent = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const file = new File(["initial content"], "file.txt", {
			type: "text/plain",
		});
		const nodeOrErr = await service.createFile(authCtx, file, {
			parent: parent.right.uuid,
		});

		const updatedFile = new File(["updated contentxxx"], "file.txt", {
			type: "text/plain",
		});
		const updateOrErr = await service.updateFile(
			authCtx,
			nodeOrErr.right.uuid,
			updatedFile,
		);
		expect(updateOrErr.isRight(), errToMsg(updateOrErr.value)).toBeTruthy();

		const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
		const updatedFileOrErr = await service.export(
			authCtx,
			nodeOrErr.right.uuid,
		);

		expect(updatedNodeOrErr.isRight(), errToMsg(updatedNodeOrErr.value))
			.toBeTruthy();
		expect(updatedFileOrErr.isRight(), errToMsg(updatedFileOrErr.value))
			.toBeTruthy();
		expect((updatedNodeOrErr.right as FileNode).size).toBe(updatedFile.size);
		expect(updatedFileOrErr.right.size).toBe(updatedFile.size);
	});

	it("should return error if node is not found", async () => {
		const service = nodeService();
		const file = new File(["content"], "file.txt", { type: "text/plain" });
		const updateOrErr = await service.updateFile(authCtx, "not-found", file);

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(NodeNotFoundError);
	});

	it("should return error if node is not a file", async () => {
		const service = nodeService();
		const parent = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const nodeOrErr = await service.create(authCtx, {
			title: "Meta Node",
			mimetype: Nodes.META_NODE_MIMETYPE,
			parent: parent.right.uuid,
		});

		const file = new File(["content"], "file.txt", { type: "text/plain" });
		const updateOrErr = await service.updateFile(
			authCtx,
			nodeOrErr.right.uuid,
			file,
		);

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(NodeNotFoundError);
	});

	it("should return error if user doesn't have 'Write' permission on parent", async () => {
		const service = nodeService();
		const parent = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: "application/vnd.antbox.folder",
			permissions: {
				anonymous: [],
				group: ["Read"],
				authenticated: ["Read"],
				advanced: {},
			},
		});

		const originalFile = new File(["content"], "file.txt", {
			type: "text/plain",
		});
		const nodeOrErr = await service.createFile(authCtx, originalFile, {
			parent: parent.right.uuid,
		});

		const ctx: AuthenticationContext = {
			mode: "Direct",
			tenant: "",
			principal: { email: "otheruser@domain.com", groups: ["group-x"] },
		};

		const file = new File(["content"], "file.txt", { type: "text/plain" });
		const updateOrErr = await service.updateFile(
			ctx,
			nodeOrErr.right.uuid,
			file,
		);

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(ForbiddenError);
	});

	it("should return an error files have different mimetypes", async () => {
		const service = nodeService();
		const parent = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const file = new File(["content"], "file.txt", { type: "text/plain" });
		const nodeOrErr = await service.createFile(authCtx, file, {
			parent: parent.right.uuid,
		});

		const updatedFile = new File(["content"], "file.txt", {
			type: "application/json",
		});
		const updateOrErr = await service.updateFile(
			authCtx,
			nodeOrErr.right.uuid,
			updatedFile,
		);

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(BadRequestError);
	});
});

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "",
	principal: {
		email: "user@domain.com",
		groups: ["group-1", Groups.ADMINS_GROUP_UUID],
	},
};

const errToMsg = (
	// deno-lint-ignore no-explicit-any
	err: any,
) => (err?.message ? err.message : JSON.stringify(err));

const nodeService = (opts: Partial<NodeServiceContext> = {}) =>
	new NodeService({
		storage: opts.storage ?? new InMemoryStorageProvider(),
		repository: opts.repository ?? new InMemoryNodeRepository(),
		bus: opts.bus ?? new InMemoryEventBus(),
	});

describe("NodeService.update - UUID property validation", () => {
	it("should return error when updating uuid property to non-existing node", async () => {
		const service = nodeService();

		// Create existing target node
		await service.create(authCtx, {
			uuid: "existing-target",
			title: "Existing Target",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const props: AspectProperties = [{
			name: "reference_prop",
			title: "Reference Property",
			type: "uuid",
		}];

		// Create aspect with uuid property
		await service.create(authCtx, {
			uuid: "reference-aspect",
			title: "Reference Aspect",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with valid reference
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["reference-aspect"],
			properties: {
				"reference-aspect:reference_prop": "existing-target",
			},
		});

		// Try to update with non-existing reference
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"reference-aspect:reference_prop": "non-existing-node-uuid",
			},
		});

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(ValidationError);
	});

	it("should update node when uuid property references existing node", async () => {
		const service = nodeService();

		// Create two target nodes
		await service.create(authCtx, {
			uuid: "target-1",
			title: "Target 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.create(authCtx, {
			uuid: "target-2",
			title: "Target 2",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const props: AspectProperties = [{
			name: "reference_prop",
			title: "Reference Property",
			type: "uuid",
		}];

		// Create aspect with uuid property
		await service.create(authCtx, {
			uuid: "reference-aspect",
			title: "Reference Aspect",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with first reference
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["reference-aspect"],
			properties: {
				"reference-aspect:reference_prop": "target-1",
			},
		});

		// Update to second existing reference
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"reference-aspect:reference_prop": "target-2",
			},
		});

		expect(updateOrErr.isRight(), errToMsg(updateOrErr.value)).toBeTruthy();
	});

	it("should return error when updating uuid array property with non-existing nodes", async () => {
		const service = nodeService();

		// Create existing target nodes
		await service.create(authCtx, {
			uuid: "existing-1",
			title: "Existing 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.create(authCtx, {
			uuid: "existing-2",
			title: "Existing 2",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const props: AspectProperties = [{
			name: "references_prop",
			title: "References Property",
			type: "array",
			arrayType: "uuid",
		}];

		// Create aspect with uuid array property
		await service.create(authCtx, {
			uuid: "references-aspect",
			title: "References Aspect",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with valid references
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["references-aspect"],
			properties: {
				"references-aspect:references_prop": ["existing-1", "existing-2"],
			},
		});

		// Try to update with mix of existing and non-existing references
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"references-aspect:references_prop": [
					"existing-1",
					"non-existing-node",
				],
			},
		});

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(ValidationError);
	});

	it("should return error when updating uuid property with validationFilters to non-complying node", async () => {
		const service = nodeService();

		// Create folder and file nodes
		await service.create(authCtx, {
			uuid: "folder-node",
			title: "Folder Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const parent = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const file = new File(["content"], "test.txt", { type: "text/plain" });
		await service.createFile(authCtx, file, {
			uuid: "file-node",
			parent: parent.right.uuid,
		});

		const props: AspectProperties = [{
			name: "folder_reference_prop",
			title: "Folder Reference Property",
			type: "uuid",
			validationFilters: [["mimetype", "==", Nodes.FOLDER_MIMETYPE]],
		}];

		// Create aspect with filtered uuid property
		await service.create(authCtx, {
			uuid: "filtered-aspect",
			title: "Filtered Aspect",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with valid folder reference
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["filtered-aspect"],
			properties: {
				"filtered-aspect:folder_reference_prop": "folder-node",
			},
		});

		// Try to update reference to file node (should fail filter)
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"filtered-aspect:folder_reference_prop": "file-node",
			},
		});

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(ValidationError);
	});

	it("should update node when uuid array property with validationFilters has all complying nodes", async () => {
		const service = nodeService();

		// Create three folder nodes
		await service.create(authCtx, {
			uuid: "folder-1",
			title: "Folder 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.create(authCtx, {
			uuid: "folder-2",
			title: "Folder 2",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.create(authCtx, {
			uuid: "folder-3",
			title: "Folder 3",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const props: AspectProperties = [{
			name: "folder_references_prop",
			title: "Folder References Property",
			type: "array",
			arrayType: "uuid",
			validationFilters: [["mimetype", "==", Nodes.FOLDER_MIMETYPE]],
		}];

		// Create aspect with filtered uuid array property
		await service.create(authCtx, {
			uuid: "filtered-references-aspect",
			title: "Filtered References Aspect",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with initial references
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["filtered-references-aspect"],
			properties: {
				"filtered-references-aspect:folder_references_prop": [
					"folder-1",
					"folder-2",
				],
			},
		});

		// Update with different complying references
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"filtered-references-aspect:folder_references_prop": [
					"folder-2",
					"folder-3",
				],
			},
		});

		expect(updateOrErr.isRight(), errToMsg(updateOrErr.value)).toBeTruthy();
	});

	it("should return error when updating uuid property with complex validationFilters to non-complying node", async () => {
		const service = nodeService();

		// Create project folder and regular folder
		await service.create(authCtx, {
			uuid: "project-folder",
			title: "Project Alpha",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.create(authCtx, {
			uuid: "regular-folder",
			title: "Regular Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const props: AspectProperties = [{
			name: "project_folder_prop",
			title: "Project Folder Property",
			type: "uuid",
			validationFilters: [
				["mimetype", "==", Nodes.FOLDER_MIMETYPE],
				["title", "contains", "Project"],
			],
		}];

		// Create aspect with complex filtered uuid property
		await service.create(authCtx, {
			uuid: "complex-filtered-aspect",
			title: "Complex Filtered Aspect",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with valid project folder reference
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["complex-filtered-aspect"],
			properties: {
				"complex-filtered-aspect:project_folder_prop": "project-folder",
			},
		});

		// Try to update to regular folder (fails title filter)
		const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
			properties: {
				"complex-filtered-aspect:project_folder_prop": "regular-folder",
			},
		});

		expect(updateOrErr.isLeft()).toBeTruthy();
		expect(updateOrErr.value).toBeInstanceOf(ValidationError);
	});
});
