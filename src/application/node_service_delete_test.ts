import { describe, it } from "bdd";
import { expect, fn } from "expect";
import { NodeService } from "./node_service.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { ForbiddenError } from "shared/antbox_error.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { Folders } from "domain/nodes/folders.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import type { EventBus } from "shared/event_bus.ts";
import { pid } from "node:process";
import { Left, Right } from "shared/either.ts";

describe("NodeService.delete", () => {
	it("should delete a node and its metadata", async () => {
		const node = FileNode.create({
			title: "Node to delete",
			mimetype: Nodes.SMART_FOLDER_MIMETYPE,
			owner: "tester@domain.com",
			parent: Folders.ROOT_FOLDER_UUID,
		}).right;

		// const bus: EventBus = new InMemoryEventBus();
		const bus: EventBus = {
			publish: fn() as () => Promise<void>,
			subscribe: () => undefined,
			unsubscribe: () => undefined,
		};

		const repository = new InMemoryNodeRepository();
		await repository.add(node);

		const service = nodeService({ repository, bus });

		const deleteOrErr = await service.delete(authCtx, node.uuid);

		expect(deleteOrErr.isRight(), errToMsg(deleteOrErr.value)).toBeTruthy();

		const getNodeOrErr = await service.get(authCtx, node.uuid);
		expect(getNodeOrErr.isLeft(), errToMsg(getNodeOrErr.value)).toBeTruthy();
		expect(getNodeOrErr.value).toBeInstanceOf(NodeNotFoundError);
		expect(bus.publish).toHaveBeenCalled();
	});

	it("should return error if node is not found", async () => {
		const service = nodeService();

		const deleteOrErr = await service.delete(authCtx, "not-found");
		expect(deleteOrErr.isLeft()).toBeTruthy();
		expect(deleteOrErr.value).toBeInstanceOf(NodeNotFoundError);
	});

	it("should remove all childs if node is a folder", async () => {
		const service = nodeService();

		const folder = await service.create(authCtx, {
			title: "Folder to delete",
			mimetype: Nodes.FOLDER_MIMETYPE,
		});

		const child = await service.create(authCtx, {
			title: "Child",
			mimetype: Nodes.META_NODE_MIMETYPE,
			parent: folder.right.uuid,
		});

		const deleteOrErr = await service.delete(authCtx, folder.right.uuid);
		expect(deleteOrErr.isRight(), errToMsg(deleteOrErr.value)).toBeTruthy();

		const getChildOrErr = await service.get(authCtx, child.right.uuid);
		expect(getChildOrErr.isLeft()).toBeTruthy();
		expect(getChildOrErr.value).toBeInstanceOf(NodeNotFoundError);
	});

	it("should return a error if principal is no allowed to write on parent folder", async () => {
		const service = nodeService();

		const parent = await service.create(authCtx, {
			title: "Parent",
			mimetype: "application/vnd.antbox.folder",
		});

		const node = await service.create(authCtx, {
			title: "Node",
			mimetype: "application/json",
			parent: parent.right.uuid,
		});

		const ctx: AuthenticationContext = {
			mode: "Direct",
			tenant: "",
			principal: {
				email: "otheruser@domain.com",
				groups: ["group-x"],
			},
		};

		const deleteOrErr = await service.delete(ctx, node.right.uuid);
		expect(deleteOrErr.isLeft()).toBeTruthy();
		expect(deleteOrErr.value).toBeInstanceOf(ForbiddenError);
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
