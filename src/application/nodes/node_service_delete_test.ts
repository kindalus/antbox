import { describe, it } from "bdd";
import { expect, fn } from "expect";
import { NodeService } from "./node_service.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { ForbiddenError } from "shared/antbox_error.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { InMemoryEventBus } from "adapters/inmem/inmem_event_bus.ts";
import type { EventBus } from "shared/event_bus.ts";
import { errToMsg } from "shared/test_helpers.ts";
import { left, right } from "shared/either.ts";

describe("NodeService", () => {
	describe("delete", () => {
		it("should delete a node and its metadata", async () => {
			const node = FileNode.create({
				title: "Node to delete",
				mimetype: Nodes.SMART_FOLDER_MIMETYPE,
				owner: "tester@domain.com",
				parent: Nodes.ROOT_FOLDER_UUID,
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
				parent: Nodes.ROOT_FOLDER_UUID,
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

		it("should remove folder storage in depth-first order", async () => {
			const storage = new RecordingFolderStorageProvider();
			const service = nodeService({ storage });

			const folder = await service.create(authCtx, {
				title: "Folder with storage",
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: Nodes.ROOT_FOLDER_UUID,
			});
			expect(folder.isRight(), errToMsg(folder.value)).toBeTruthy();

			const childFolder = await service.create(authCtx, {
				title: "Child folder with storage",
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: folder.right.uuid,
			});
			expect(childFolder.isRight(), errToMsg(childFolder.value)).toBeTruthy();

			const deleteOrErr = await service.delete(authCtx, folder.right.uuid);
			expect(deleteOrErr.isRight(), errToMsg(deleteOrErr.value)).toBeTruthy();
			expect(storage.deleted).toEqual([childFolder.right.uuid, folder.right.uuid]);
		});

		it("should remove all descendants when deleting folders with more than one page of children", async () => {
			const service = nodeService();

			const folder = await service.create(authCtx, {
				title: "Paged Folder",
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: Nodes.ROOT_FOLDER_UUID,
			});
			expect(folder.isRight(), errToMsg(folder.value)).toBeTruthy();

			const children = [] as string[];
			let nestedChildUuid = "";
			for (let i = 0; i < 25; i++) {
				const child = await service.create(authCtx, {
					title: `Child ${String(i).padStart(2, "0")}`,
					mimetype: i === 0 ? Nodes.FOLDER_MIMETYPE : Nodes.META_NODE_MIMETYPE,
					parent: folder.right.uuid,
				});
				expect(child.isRight(), errToMsg(child.value)).toBeTruthy();
				children.push(child.right.uuid);

				if (i === 0) {
					const nestedChild = await service.create(authCtx, {
						title: "Nested Child",
						mimetype: Nodes.META_NODE_MIMETYPE,
						parent: child.right.uuid,
					});
					expect(nestedChild.isRight(), errToMsg(nestedChild.value)).toBeTruthy();
					nestedChildUuid = nestedChild.right.uuid;
				}
			}

			const deleteOrErr = await service.delete(authCtx, folder.right.uuid);
			expect(deleteOrErr.isRight(), errToMsg(deleteOrErr.value)).toBeTruthy();

			for (const childUuid of [...children, nestedChildUuid]) {
				const getChildOrErr = await service.get(authCtx, childUuid);
				expect(getChildOrErr.isLeft()).toBeTruthy();
				expect(getChildOrErr.value).toBeInstanceOf(NodeNotFoundError);
			}
		});

		it("should not delete a parent folder when any descendant delete fails", async () => {
			const storage = new FailingDeleteStorageProvider();
			const service = nodeService({ storage });

			const folder = await service.create(authCtx, {
				title: "Folder with failing child",
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: Nodes.ROOT_FOLDER_UUID,
			});
			expect(folder.isRight(), errToMsg(folder.value)).toBeTruthy();

			const childFolder = await service.create(authCtx, {
				title: "Child folder",
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: folder.right.uuid,
			});
			expect(childFolder.isRight(), errToMsg(childFolder.value)).toBeTruthy();

			const grandchild = await service.createFile(
				authCtx,
				new File(["content"], "grandchild.txt", { type: "text/plain" }),
				{ title: "grandchild.txt", parent: childFolder.right.uuid },
			);
			expect(grandchild.isRight(), errToMsg(grandchild.value)).toBeTruthy();
			storage.failUuid = grandchild.right.uuid;

			const deleteOrErr = await service.delete(authCtx, folder.right.uuid);

			expect(deleteOrErr.isLeft()).toBeTruthy();
			const getParentOrErr = await service.get(authCtx, folder.right.uuid);
			expect(getParentOrErr.isRight(), errToMsg(getParentOrErr.value)).toBeTruthy();
			const getChildFolderOrErr = await service.get(authCtx, childFolder.right.uuid);
			expect(getChildFolderOrErr.isRight(), errToMsg(getChildFolderOrErr.value)).toBeTruthy();
		});

		it("should return a error if principal is no allowed to write on parent folder", async () => {
			const service = nodeService();

			const parent = await service.create(authCtx, {
				title: "Parent",
				mimetype: "application/vnd.antbox.folder",
				parent: Nodes.ROOT_FOLDER_UUID,
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
});

class RecordingFolderStorageProvider extends InMemoryStorageProvider {
	readonly deleted: string[] = [];

	override rmdir(uuid: string): ReturnType<InMemoryStorageProvider["rmdir"]> {
		this.deleted.push(uuid);
		return Promise.resolve(right(undefined));
	}
}

class FailingDeleteStorageProvider extends InMemoryStorageProvider {
	failUuid?: string;

	override delete(uuid: string): ReturnType<InMemoryStorageProvider["delete"]> {
		if (uuid === this.failUuid) {
			return Promise.resolve(left<NodeNotFoundError, void>(new NodeNotFoundError(uuid)));
		}

		return super.delete(uuid);
	}
}

const authCtx: AuthenticationContext = {
	mode: "Direct",
	tenant: "",
	principal: {
		email: "user@domain.com",
		groups: ["group-1", Groups.ADMINS_GROUP_UUID],
	},
};

const nodeService = (opts: Partial<NodeServiceContext> = {}) =>
	new NodeService({
		storage: opts.storage ?? new InMemoryStorageProvider(),
		repository: opts.repository ?? new InMemoryNodeRepository(),
		bus: opts.bus ?? new InMemoryEventBus(),
		configRepo: opts.configRepo ?? new InMemoryConfigurationRepository(),
	});
