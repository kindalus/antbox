import { describe, test } from "bdd";
import { expect } from "expect";
import { NodeService } from "./node_service.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import type { FileLikeNode } from "domain/node_like.ts";
import { Folders } from "domain/nodes/folders.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { Permissions } from "domain/nodes/node.ts";
import { ValidationError } from "shared/validation_error.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import type { AspectProperties } from "domain/aspects/aspect_node.ts";
import { ADMINS_GROUP } from "application/builtin_groups/index.ts";
import { Left, Right } from "shared/either.ts";

describe("NodeService.create", () => {
	test("should create a node and persist the metadata", async () => {
		const service = nodeService();

		await service.create(authCtx, {
			uuid: "--parent--",
			title: "Folder 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.create(authCtx, {
			uuid: "--child--",
			title: "Node 1",
			mimetype: Nodes.META_NODE_MIMETYPE,
			parent: "--parent--",
		});

		const nodeOrErr = await service.get(authCtx, "--child--");

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
		expect(nodeOrErr.right.title).toBe("Node 1");
		expect(nodeOrErr.right.parent).toBe("--parent--");
		expect(nodeOrErr.right.mimetype).toBe(Nodes.META_NODE_MIMETYPE);
	});

	test("should return an error when properties are inconsistent with aspect specifications", async () => {
		const service = nodeService();

		const props: AspectProperties = [{
			name: "amount",
			title: "Amount",
			type: "number",
		}];

		// Create aspect with string property type
		(
			await service.create(authCtx, {
				uuid: "invoice",
				title: "Invoice",
				mimetype: Nodes.ASPECT_MIMETYPE,
				properties: props,
			})
		).right;

		// Try to create node with invalid property value type
		const nodeOrErr = await service.create(authCtx, {
			title: "Invalid Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["invoice"],
			properties: {
				"invoice:amount": "Invalid value",
			},
		});

		expect(nodeOrErr.isLeft()).toBeTruthy();
		expect(nodeOrErr.value).toBeInstanceOf(ValidationError);
	});

	test("should ignore properties that are not defined in any node aspect", async () => {
		const service = nodeService();

		const props: AspectProperties = [{
			name: "amount",
			title: "Amount",
			type: "number",
		}];

		// Create aspect with number property
		await service.create(authCtx, {
			uuid: "invoice",
			title: "Invoice",
			mimetype: Nodes.ASPECT_MIMETYPE,
			properties: props,
		});

		// Create node with valid aspect property and undefined properties
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["invoice"],
			properties: {
				"invoice:amount": 1000, // valid property
				"undefined:property": "should be ignored", // undefined aspect
				"invoice:nonexistent": "should be ignored", // undefined property in existing aspect
			},
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();

		// Verify the node was created successfully
		const retrievedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);

		expect(retrievedNodeOrErr.isRight(), errToMsg(retrievedNodeOrErr.value))
			.toBeTruthy();

		const retrievedNode = retrievedNodeOrErr.value as FolderNode;

		// The node should have the valid property but undefined properties should be ignored
		expect(retrievedNode.properties).toBeDefined();
		expect(retrievedNode.properties["invoice:amount"]).toBe(1000);
		expect(retrievedNode.properties["undefined:property"])
			.toBeUndefined();
		expect(retrievedNode.properties["invoice:nonexistent"])
			.toBeUndefined();
	});

	test("should return an error if a provided aspect does not exist", async () => {
		const service = nodeService();

		// Try to create node with non-existent aspect
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["nonexistent-aspect"],
			properties: {
				"nonexistent-aspect:property": "value",
			},
		});

		expect(nodeOrErr.isLeft()).toBeTruthy();
		expect(nodeOrErr.value).toBeInstanceOf(ValidationError);
	});

	test("should use give permissions", async () => {
		const permissions: Permissions = {
			anonymous: [],
			group: ["Read", "Export"],
			authenticated: ["Read"],
			advanced: {},
		};

		const service = nodeService();
		const node = await service.create(authCtx, {
			title: "Folder 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
			permissions,
		});

		expect((node.right as FolderNode).permissions).toEqual(permissions);
	});

	test("should have the same permissions (folder) as parent's if no permissions given", async () => {
		const permissions: Permissions = {
			anonymous: ["Read"],
			group: ["Read", "Write"],
			authenticated: ["Read"],
			advanced: {
				"some-group": ["Read"],
			},
		};

		const service = nodeService();
		await service.create(authCtx, {
			uuid: "--parent--",
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			permissions,
		});

		const node = await service.create(authCtx, {
			title: "Folder 2",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: "--parent--",
		});

		expect((node.right as FolderNode).permissions).toEqual(permissions);
	});

	test("should use title to generate fid if not given", async () => {
		const service = nodeService();

		const nodeOrErr = await service.create(authCtx, {
			title: "Unique Title",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
		expect(nodeOrErr.right.fid).toBeDefined();
		expect(nodeOrErr.right.fid).toBe("unique-title");
	});

	test("should store in root folder if no parent given", async () => {
		const nodeOrErr = await nodeService().create(authCtx, {
			title: "Folder 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
		expect(nodeOrErr.right.parent).toBe(Folders.ROOT_FOLDER_UUID);
	});

	test("should convey to folder children restrictions", async () => {
		const nodeOrErr = await nodeService().createFile(authCtx, dummyFile, {
			parent: Folders.ROOT_FOLDER_UUID,
		});

		expect(nodeOrErr.isLeft(), errToMsg(nodeOrErr.value)).toBeTruthy();
		expect(nodeOrErr.value).toBeInstanceOf(BadRequestError);
	});
});

describe("NodeService.createFile", () => {
	test("should create a file and persist the metadata", async () => {
		const repository = new InMemoryNodeRepository();
		const service = nodeService({ repository });

		repository.add(
			FolderNode.create({
				uuid: "--parent--",
				title: "Folder",
				owner: "user@domain.com",
				group: "group@domain.com",
			}).right,
		);

		const file = new File(["<html><body>Ola</body></html>"], "index.html", {
			type: "text/html",
		});
		const nodeOrErr = await service.createFile(authCtx, file, {
			parent: "--parent--",
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();

		const node = await service
			.get(authCtx, nodeOrErr.right.uuid)
			.then((r) => r.right as FileLikeNode);

		expect(node.size).toBe(file.size);
		expect(node.mimetype).toBe(file.type);
		expect(node.title).toBe(file.name);
		expect(node.fid).toBeDefined();
	});

	test("should use filename as title if not given", async () => {
		const service = nodeService();
		await service.create(authCtx, {
			uuid: "--parent--",
			title: "Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const nodeOrErr = await service.createFile(authCtx, dummyFile, {
			parent: "--parent--",
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
		expect(nodeOrErr.right.title).toBe(dummyFile.name);
	});

	test("should store the file", async () => {
		const storage = new InMemoryStorageProvider();
		const service = nodeService({ storage });

		const parent = await service.create(authCtx, {
			title: "Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const fileNode = await service.createFile(authCtx, dummyFile, {
			parent: parent.right.uuid,
		});
		const fileOrErr = await storage.read(fileNode.right.uuid);

		expect(fileOrErr.isRight()).toBeTruthy();
		expect(fileOrErr.right.size).toBe(dummyFile.size);
	});

	test("should use file mimetype", async () => {
		const service = nodeService();
		await service.create(authCtx, {
			uuid: "--parent--",
			title: "Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const nodeOrErr = await service.createFile(authCtx, dummyFile, {
			parent: "--parent--",
			mimetype: "image/jpeg",
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
		expect(nodeOrErr.right.mimetype).toBe(dummyFile.type);
	});

	test("should use node mimetype if given action or ext mimetype", async () => {
		const service = nodeService();

		// Create parent folder first
		await service.create(authCtx, {
			uuid: "--parent--",
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const nodeOrErr = await service.createFile(authCtx, dummyFile, {
			parent: "--parent--",
			exposeExtension: true,
			mimetype: Nodes.FEATURE_MIMETYPE,
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
		expect(nodeOrErr.right.mimetype).toBe(Nodes.FEATURE_MIMETYPE);
	});
});

describe("NodeService.duplicate", () => {
	test("should create the same node in the same directory with diferent uuid, fid and a title with '2' as suffix", async () => {
		const service = nodeService();
		const parent = await service.create(authCtx, {
			title: "Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		const node = await service.create(authCtx, {
			title: "Meta File",
			mimetype: Nodes.META_NODE_MIMETYPE,
			parent: parent.right.uuid,
		});

		const duplicate = await service.duplicate(authCtx, node.right.uuid);

		expect(duplicate.isRight(), errToMsg(duplicate.value)).toBeTruthy();
		expect(duplicate.right.title).toBe("Meta File 2");
		expect(duplicate.right.uuid).not.toBe(node.right.uuid);
		expect(duplicate.right.fid).not.toBe(node.right.fid);
		expect(duplicate.right.parent).toBe(node.right.parent);
		expect(duplicate.right.mimetype).toBe(node.right.mimetype);
	});

	test("should create a copy of the file if node is a file like node", async () => {
		const service = nodeService();
		const parent = await service.create(authCtx, {
			title: "Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		const node = await service.createFile(authCtx, dummyFile, {
			parent: parent.right.uuid,
		});

		const duplicateOrErr = await service.duplicate(authCtx, node.right.uuid);
		const duplicatedFileOrErr = await service.export(
			authCtx,
			duplicateOrErr.right.uuid,
		);

		expect(duplicatedFileOrErr.isRight(), errToMsg(duplicatedFileOrErr.value))
			.toBeTruthy();
		expect(duplicatedFileOrErr.right.size).toBe(dummyFile.size);
	});

	test("should return a error if node to duplicate is a folder node", async () => {
		const service = nodeService();
		const parent = await service.create(authCtx, {
			title: "Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		const folder = await service.create(authCtx, {
			title: "Folder to Duplicate",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: parent.right.uuid,
		});

		const duplicateOrErr = await service.duplicate(authCtx, folder.right.uuid);

		expect(duplicateOrErr.isRight()).toBeFalsy();
		expect(duplicateOrErr.value).toBeInstanceOf(BadRequestError);
	});
});

describe("NodeService.copy", () => {
	test("should copy a node to a new parent folder", async () => {
		const service = nodeService();
		const parent1 = await service.create(authCtx, {
			title: "Parent Folder 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		const parent2 = await service.create(authCtx, {
			title: "Parent Folder 2",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		const node = await service.create(authCtx, {
			title: "Meta File",
			mimetype: Nodes.META_NODE_MIMETYPE,
			parent: parent1.right.uuid,
		});

		const copyOrErr = await service.copy(
			authCtx,
			node.right.uuid,
			parent2.right.uuid,
		);

		expect(copyOrErr.isRight(), errToMsg(copyOrErr.value)).toBeTruthy();
		expect(copyOrErr.right.title).toBe("Meta File 2");
		expect(copyOrErr.right.uuid).not.toBe(node.right.uuid);
		expect(copyOrErr.right.parent).toBe(parent2.right.uuid);
		expect(copyOrErr.right.mimetype).toBe(node.right.mimetype);
	});

	test("should return error if node to copy is a folder", async () => {
		const service = nodeService();
		const parent = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		const folder = await service.create(authCtx, {
			title: "Folder to Copy",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: parent.right.uuid,
		});

		const copyOrErr = await service.copy(
			authCtx,
			folder.right.uuid,
			parent.right.uuid,
		);

		expect(copyOrErr.isRight()).toBeFalsy();
		expect(copyOrErr.value).toBeInstanceOf(BadRequestError);
	});

	test("should create a copy of the file if node is a file like node", async () => {
		const service = nodeService();
		const parent1 = await service.create(authCtx, {
			title: "Parent Folder 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		const parent2 = await service.create(authCtx, {
			title: "Parent Folder 2",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});
		const node = await service.createFile(authCtx, dummyFile, {
			parent: parent1.right.uuid,
		});

		const copyOrErr = await service.copy(
			authCtx,
			node.right.uuid,
			parent2.right.uuid,
		);
		const copiedFileOrErr = await service.export(authCtx, copyOrErr.right.uuid);

		expect(copiedFileOrErr.isRight(), errToMsg(copiedFileOrErr.value))
			.toBeTruthy();
		expect(copiedFileOrErr.right.size).toBe(dummyFile.size);
	});
});

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "",
	principal: {
		email: "user@example.com",
		groups: [ADMINS_GROUP.uuid, "user"],
	},
};

const errToMsg = (err: unknown) => {
	const v = err instanceof Left || err instanceof Right ? err.value : err;
	if (v instanceof Error) {
		return v.message;
	}

	return JSON.stringify(v, null, 3);
};
const nodeService = (opts: Partial<NodeServiceContext> = {}) =>
	new NodeService({
		storage: opts.storage ?? new InMemoryStorageProvider(),
		repository: opts.repository ?? new InMemoryNodeRepository(),
		bus: opts.bus ?? new InMemoryEventBus(),
	});

const dummyFile = new File(["Ola"], "ola.txt", { type: "text/plain" });

describe("NodeService.create - UUID property validation", () => {
	test("should return error when uuid property references non-existing node", async () => {
		const service = nodeService();

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

		// Try to create node with non-existing uuid reference
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["reference-aspect"],
			properties: {
				"reference-aspect:reference_prop": "non-existing-node-uuid",
			},
		});

		expect(nodeOrErr.isLeft()).toBeTruthy();
		expect(nodeOrErr.value).toBeInstanceOf(ValidationError);
	});

	test("should create node when uuid property references existing node", async () => {
		const service = nodeService();

		// Create a target node to reference
		const _targetNodeOrErr = await service.create(authCtx, {
			uuid: "target-node-uuid",
			title: "Target Node",
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

		// Create node with existing uuid reference
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["reference-aspect"],
			properties: {
				"reference-aspect:reference_prop": "target-node-uuid",
			},
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
	});

	test("should return error when uuid array property has non-existing node references", async () => {
		const service = nodeService();

		// Create one existing target node
		await service.create(authCtx, {
			uuid: "existing-node-uuid",
			title: "Existing Node",
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

		// Try to create node with mix of existing and non-existing uuid references
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["references-aspect"],
			properties: {
				"references-aspect:references_prop": [
					"existing-node-uuid",
					"non-existing-node-uuid",
				],
			},
		});

		expect(nodeOrErr.isLeft()).toBeTruthy();
		expect(nodeOrErr.value).toBeInstanceOf(ValidationError);
	});

	test("should create node when uuid array property has all existing node references", async () => {
		const service = nodeService();

		// Create target nodes to reference
		await service.create(authCtx, {
			uuid: "target-node-1",
			title: "Target Node 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.create(authCtx, {
			uuid: "target-node-2",
			title: "Target Node 2",
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

		// Create node with all existing uuid references
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["references-aspect"],
			properties: {
				"references-aspect:references_prop": ["target-node-1", "target-node-2"],
			},
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
	});

	test("should return error when uuid property with validationFilters references non-complying node", async () => {
		const service = nodeService();

		// Create a file node (not a folder)
		const file = new File(["content"], "test.txt", { type: "text/plain" });
		const parent = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const _fileNodeOrErr = await service.createFile(authCtx, file, {
			uuid: "file-node-uuid",
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

		// Try to create node referencing file node when filter expects folder
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["filtered-aspect"],
			properties: {
				"filtered-aspect:folder_reference_prop": "file-node-uuid",
			},
		});

		expect(nodeOrErr.isLeft()).toBeTruthy();
		expect(nodeOrErr.value).toBeInstanceOf(ValidationError);
	});

	test("should create node when uuid property with validationFilters references complying node", async () => {
		const service = nodeService();

		// Create a folder node
		const _folderNodeOrErr = await service.create(authCtx, {
			uuid: "folder-node-uuid",
			title: "Target Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
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

		// Create node referencing folder node when filter expects folder
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["filtered-aspect"],
			properties: {
				"filtered-aspect:folder_reference_prop": "folder-node-uuid",
			},
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
	});

	test("should return error when uuid array property with validationFilters has non-complying nodes", async () => {
		const service = nodeService();

		// Create a folder node and a file node
		const _folderNodeOrErr = await service.create(authCtx, {
			uuid: "folder-node-uuid",
			title: "Target Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const parent = await service.create(authCtx, {
			title: "Parent Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const file = new File(["content"], "test.txt", { type: "text/plain" });
		const _fileNodeOrErr = await service.createFile(authCtx, file, {
			uuid: "file-node-uuid",
			parent: parent.right.uuid,
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

		// Try to create node with mix of complying and non-complying references
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["filtered-references-aspect"],
			properties: {
				"filtered-references-aspect:folder_references_prop": [
					"folder-node-uuid",
					"file-node-uuid",
				],
			},
		});

		expect(nodeOrErr.isLeft()).toBeTruthy();
		expect(nodeOrErr.value).toBeInstanceOf(ValidationError);
	});

	test("should create node when uuid array property with validationFilters has all complying nodes", async () => {
		const service = nodeService();

		// Create two folder nodes
		await service.create(authCtx, {
			uuid: "folder-node-1",
			title: "Target Folder 1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.create(authCtx, {
			uuid: "folder-node-2",
			title: "Target Folder 2",
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

		// Create node with all complying references
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["filtered-references-aspect"],
			properties: {
				"filtered-references-aspect:folder_references_prop": [
					"folder-node-1",
					"folder-node-2",
				],
			},
		});

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
	});

	test("should return error when uuid property with complex validationFilters references non-complying node", async () => {
		const service = nodeService();

		// Create a folder node without "Project" in title
		await service.create(authCtx, {
			uuid: "regular-folder-uuid",
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

		// Try to create node referencing folder that doesn't match title filter
		const nodeOrErr = await service.create(authCtx, {
			title: "Test Node",
			mimetype: Nodes.FOLDER_MIMETYPE,
			aspects: ["complex-filtered-aspect"],
			properties: {
				"complex-filtered-aspect:project_folder_prop": "regular-folder-uuid",
			},
		});

		expect(nodeOrErr.isLeft()).toBeTruthy();
		expect(nodeOrErr.value).toBeInstanceOf(ValidationError);
	});
});
