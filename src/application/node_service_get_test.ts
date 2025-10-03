import { describe, it } from "bdd";
import { expect } from "expect";

import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { NodeService } from "./node_service.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Users } from "domain/users_groups/users.ts";
import { ForbiddenError } from "shared/antbox_error.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodeFileNotFoundError } from "domain/nodes/node_file_not_found_error.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";

describe("NodeService.get", () => {
	it("should return node information from repository", async () => {
		const node = FileNode.create({
			uuid: "uuid",
			title: "title",
			mimetype: "application/pdf",
			size: 123,
			parent: Folders.ROOT_FOLDER_UUID,
			owner: "owner@antbox.io",
		}).right;

		const repository = new InMemoryNodeRepository();
		await repository.add(node);

		const service = new NodeService({
			storage: new InMemoryStorageProvider(),
			repository,
			bus: new InMemoryEventBus(),
		});

		const nodeOrErr = await service.get(authCtx, node.uuid);

		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
		expect(nodeOrErr.right).toEqual(node);
	});

	it("should return if uuid is in fid format", async () => {
		const service = nodeService();
		await service.create(authCtx, {
			title: "Folder 1",
			fid: "fid-1",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const nodeOrErr = await service.get(authCtx, "--fid--fid-1");
		expect(nodeOrErr.isRight(), errToMsg(nodeOrErr.value)).toBeTruthy();
		expect(nodeOrErr.right.title).toEqual("Folder 1");
		expect(nodeOrErr.right.mimetype).toEqual(Nodes.FOLDER_MIMETYPE);
	});

	it("should return error if node is not found", async () => {
		const repository = new InMemoryNodeRepository();
		const service = new NodeService({
			storage: new InMemoryStorageProvider(),
			repository,
			bus: new InMemoryEventBus(),
		});

		const nodeOrErr = await service.get(authCtx, "not-found");

		expect(nodeOrErr.isRight()).toBeFalsy();
		expect(nodeOrErr.value).toBeInstanceOf(NodeNotFoundError);
	});

	it("should return an error if user doesn't have 'Read' permission on parent", async () => {
		const parent = FolderNode.create({
			uuid: "parent",
			title: "title",
			parent: "root",
			owner: Users.ROOT_USER_EMAIL,
			group: Groups.ADMINS_GROUP_UUID,
			permissions: {
				anonymous: [],
				group: ["Read"],
				authenticated: [],
				advanced: {},
			},
		}).right;

		const node = FileNode.create({
			uuid: "uuid",
			title: "title",
			mimetype: "application/pdf",
			size: 123,
			parent: "parent",
			owner: Users.ROOT_USER_EMAIL,
		}).right;

		const authCtx: AuthenticationContext = {
			mode: "Direct",
			tenant: "default",
			principal: {
				email: "someemail@gmail.com",
				groups: ["group1"],
			},
		};

		const repository = new InMemoryNodeRepository();
		await repository.add(parent);
		await repository.add(node);

		const service = new NodeService({
			storage: new InMemoryStorageProvider(),
			repository,
			bus: new InMemoryEventBus(),
		});

		const nodeOrErr = await service.get(authCtx, node.uuid);

		expect(nodeOrErr.isRight()).toBeFalsy();
		expect(nodeOrErr.value).toBeInstanceOf(ForbiddenError);
	});
});

describe("NodeService.export", () => {
	it("should return the file", async () => {
		const service = nodeService();
		await service.create(authCtx, {
			uuid: "parent-uuid",
			title: "Documents",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.createFile(authCtx, file, {
			uuid: "file-uuid",
			parent: "parent-uuid",
		});

		const fileOrErr = await service.export(authCtx, "file-uuid");

		expect(fileOrErr.isRight(), errToMsg(fileOrErr.value)).toBeTruthy();
		expect(fileOrErr.right.size).toEqual(file.size);
		expect(fileOrErr.right.type).toEqual(file.type);
	});

	it("should return error if file is not found", async () => {
		const service = nodeService();
		const fileOrErr = await service.export(authCtx, "not-found");

		expect(fileOrErr.isRight()).toBeFalsy();
		expect(fileOrErr.value).toBeInstanceOf(NodeNotFoundError);
	});

	it("should return error if user doesn't have 'Export' permission on parent", async () => {
		const service = nodeService();
		await service.create(authCtx, {
			uuid: "parent-uuid",
			title: "Documents",
			mimetype: Nodes.FOLDER_MIMETYPE,
			permissions: {
				anonymous: [],
				group: ["Read"],
				authenticated: ["Read"],
				advanced: {},
			},
		});

		await service.createFile(authCtx, file, {
			uuid: "file-uuid",
			parent: "parent-uuid",
		});
		const fileOrErr = await service.export(
			{
				mode: "Direct",
				tenant: "",
				principal: { email: "otheruser@email.com", groups: ["XXXXX"] },
			},
			"file-uuid",
		);
		expect(fileOrErr.isRight()).toBeFalsy();
		expect(fileOrErr.value).toBeInstanceOf(ForbiddenError);
	});

	it("should return an error if node is not a file", async () => {
		const repository = new InMemoryNodeRepository();
		const service = new NodeService({
			storage: new InMemoryStorageProvider(),
			repository,
			bus: new InMemoryEventBus(),
		});

		await service.create(authCtx, {
			uuid: "puuid",
			title: "Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		await service.create(authCtx, {
			uuid: "nuuid",
			title: "Meta",
			parent: "puuid",
			mimetype: Nodes.META_NODE_MIMETYPE,
		});

		const fileOrErr = await service.export(authCtx, "nuuid");

		expect(fileOrErr.isRight()).toBeFalsy();
		expect(fileOrErr.value).toBeInstanceOf(NodeFileNotFoundError);
	});
});

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "default",
	principal: {
		email: "user@dmain.com",
		groups: ["group1", Groups.ADMINS_GROUP_UUID],
	},
};

const errToMsg = (err: unknown): string => {
	if (err instanceof Error) {
		return err.message;
	}
	return JSON.stringify(err, null, 2);
};

const nodeService = () =>
	new NodeService({
		storage: new InMemoryStorageProvider(),
		repository: new InMemoryNodeRepository(),
		bus: new InMemoryEventBus(),
	});

const file = new File(["xxxxxxx"], "file.pdf", { type: "application/pdf" });
