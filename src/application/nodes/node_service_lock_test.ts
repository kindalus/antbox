import { describe, it } from "bdd";
import { expect } from "expect";
import { NodeService } from "./node_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryConfigurationRepository } from "adapters/inmem/inmem_configuration_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { Event } from "shared/event.ts";
import type { EventHandler } from "shared/event_handler.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Groups } from "domain/users_groups/groups.ts";
import { Users } from "domain/users_groups/users.ts";

// Mock EventBus implementation
class MockEventBus implements EventBus {
	async publish(_event: Event): Promise<void> {}
	subscribe(_eventId: string, _handler: EventHandler<Event>): void {}
	unsubscribe(_eventId: string, _handler: EventHandler<Event>): void {}
}

describe("NodeService - Lock/Unlock", () => {
	function createContext(): NodeServiceContext {
		return {
			repository: new InMemoryNodeRepository(),
			storage: new InMemoryStorageProvider(),
			bus: new MockEventBus(),
			configRepo: new InMemoryConfigurationRepository(),
		};
	}

	function createAuthContext(
		email: string,
		groups: string[] = [Groups.ADMINS_GROUP_UUID],
	): AuthenticationContext {
		return {
			principal: {
				email,
				groups,
			},
			tenant: "test-tenant",
			mode: "Direct",
		};
	}

	function createNonAdminAuthContext(
		email: string,
		groups: string[] = ["users"],
	): AuthenticationContext {
		return {
			principal: {
				email,
				groups,
			},
			tenant: "test-tenant",
			mode: "Direct",
		};
	}

	async function createTestFolder(
		service: NodeService,
		authCtx: AuthenticationContext,
	): Promise<string> {
		const folderOrErr = await service.create(authCtx, {
			title: "Test Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Nodes.ROOT_FOLDER_UUID,
			permissions: {
				group: ["Read", "Write", "Export"],
				authenticated: ["Read", "Write", "Export"],
				anonymous: [],
				advanced: {},
			},
		});
		return folderOrErr.right.uuid;
	}

	describe("lock", () => {
		it("should lock a node successfully", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx = createAuthContext("user@example.com", [Groups.ADMINS_GROUP_UUID]);

			// Create a test folder and node
			const testFolderUuid = await createTestFolder(service, authCtx);
			const nodeOrErr = await service.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: testFolderUuid,
			});

			expect(nodeOrErr.isRight()).toBe(true);
			const node = nodeOrErr.right;

			// Lock the node
			const lockOrErr = await service.lock(
				authCtx,
				node.uuid,
				["editors", "managers"],
			);

			expect(lockOrErr.isRight()).toBe(true);

			// Verify node is locked
			const lockedNodeOrErr = await service.get(authCtx, node.uuid);
			expect(lockedNodeOrErr.isRight()).toBe(true);
			const lockedNode = lockedNodeOrErr.right;

			expect(lockedNode.locked).toBe(true);
			expect(lockedNode.lockedBy).toBe("user@example.com");
			expect(lockedNode.unlockAuthorizedGroups).toEqual(["editors", "managers"]);
		});

		it("should not allow locking an already locked node", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx1 = createAuthContext("user1@example.com", [Groups.ADMINS_GROUP_UUID]);
			const authCtx2 = createAuthContext("user2@example.com", [Groups.ADMINS_GROUP_UUID]);

			// Create a test folder and node, then lock it
			const testFolderUuid = await createTestFolder(service, authCtx1);
			const nodeOrErr = await service.create(authCtx1, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: testFolderUuid,
			});

			await service.lock(authCtx1, nodeOrErr.right.uuid, ["editors"]);

			// Try to lock again by different user
			const lockOrErr = await service.lock(authCtx2, nodeOrErr.right.uuid, ["managers"]);

			expect(lockOrErr.isLeft()).toBe(true);
			if (lockOrErr.isLeft()) {
				expect(lockOrErr.value.message).toContain("already locked");
			}
		});

		it("should return error for non-existent node", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx = createAuthContext("user@example.com");

			const lockOrErr = await service.lock(authCtx, "non-existent-uuid", ["editors"]);

			expect(lockOrErr.isLeft()).toBe(true);
		});
	});

	describe("unlock", () => {
		it("should allow the locking user to unlock", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx = createAuthContext("user@example.com", [Groups.ADMINS_GROUP_UUID]);

			// Create a test folder, node and lock it
			const testFolderUuid = await createTestFolder(service, authCtx);
			const nodeOrErr = await service.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: testFolderUuid,
			});

			await service.lock(authCtx, nodeOrErr.right.uuid, ["editors"]);

			// Unlock by same user
			const unlockOrErr = await service.unlock(authCtx, nodeOrErr.right.uuid);

			expect(unlockOrErr.isRight()).toBe(true);

			// Verify node is unlocked
			const unlockedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
			expect(unlockedNodeOrErr.isRight()).toBe(true);
			const unlockedNode = unlockedNodeOrErr.right;

			expect(unlockedNode.locked).toBe(false);
			expect(unlockedNode.lockedBy).toBe("");
			expect(unlockedNode.unlockAuthorizedGroups).toEqual([]);
		});

		it("should allow authorized group member to unlock", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx1 = createAuthContext("user1@example.com", [Groups.ADMINS_GROUP_UUID]);
			const authCtx2 = createNonAdminAuthContext("user2@example.com", ["editors", "users"]);

			// Create a test folder, node and lock it
			const testFolderUuid = await createTestFolder(service, authCtx1);
			const nodeOrErr = await service.create(authCtx1, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: testFolderUuid,
			});

			await service.lock(authCtx1, nodeOrErr.right.uuid, ["editors", "managers"]);

			// Unlock by user in authorized group
			const unlockOrErr = await service.unlock(authCtx2, nodeOrErr.right.uuid);

			expect(unlockOrErr.isRight()).toBe(true);

			// Verify node is unlocked
			const unlockedNodeOrErr = await service.get(authCtx2, nodeOrErr.right.uuid);
			const unlockedNode = unlockedNodeOrErr.right;

			expect(unlockedNode.locked).toBe(false);
		});

		it("should not allow unauthorized user to unlock", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx1 = createAuthContext("user1@example.com", [Groups.ADMINS_GROUP_UUID]);
			const authCtx2 = createNonAdminAuthContext("user2@example.com", ["other-group"]);

			// Create a test folder, node and lock it
			const testFolderUuid = await createTestFolder(service, authCtx1);
			const nodeOrErr = await service.create(authCtx1, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: testFolderUuid,
			});

			await service.lock(authCtx1, nodeOrErr.right.uuid, ["editors"]);

			// Try to unlock by unauthorized user
			const unlockOrErr = await service.unlock(authCtx2, nodeOrErr.right.uuid);

			expect(unlockOrErr.isLeft()).toBe(true);
			if (unlockOrErr.isLeft()) {
				expect(unlockOrErr.value.message).toContain("not allowed");
			}
		});

		it("should return error when unlocking a non-locked node", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx = createAuthContext("user@example.com");

			// Create a test folder and node but don't lock it
			const testFolderUuid = await createTestFolder(service, authCtx);
			const nodeOrErr = await service.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: testFolderUuid,
			});

			// Try to unlock
			const unlockOrErr = await service.unlock(authCtx, nodeOrErr.right.uuid);

			expect(unlockOrErr.isLeft()).toBe(true);
			if (unlockOrErr.isLeft()) {
				expect(unlockOrErr.value.message).toContain("not locked");
			}
		});
	});

	describe("update - lock enforcement", () => {
		it("should prevent updating a locked node by unauthorized user", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx1 = createAuthContext("user1@example.com", [Groups.ADMINS_GROUP_UUID]);
			const authCtx2 = createNonAdminAuthContext("user2@example.com", ["other-group"]);

			// Create a test folder, node and lock it
			const testFolderUuid = await createTestFolder(service, authCtx1);
			const nodeOrErr = await service.create(authCtx1, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: testFolderUuid,
			});

			await service.lock(authCtx1, nodeOrErr.right.uuid, ["editors"]);

			// Try to update by unauthorized user
			const updateOrErr = await service.update(authCtx2, nodeOrErr.right.uuid, {
				title: "Updated Title",
			});

			expect(updateOrErr.isLeft()).toBe(true);
			if (updateOrErr.isLeft()) {
				expect(updateOrErr.value.message).toContain("locked");
			}
		});

		it("should allow the locking user to update", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx = createAuthContext("user@example.com", [Groups.ADMINS_GROUP_UUID]);

			// Create a test folder, node and lock it
			const testFolderUuid = await createTestFolder(service, authCtx);
			const nodeOrErr = await service.create(authCtx, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: testFolderUuid,
			});

			await service.lock(authCtx, nodeOrErr.right.uuid, ["editors"]);

			// Update by same user (locking user)
			const updateOrErr = await service.update(authCtx, nodeOrErr.right.uuid, {
				title: "Updated Title",
			});

			expect(updateOrErr.isRight()).toBe(true);

			// Verify update
			const updatedNodeOrErr = await service.get(authCtx, nodeOrErr.right.uuid);
			expect(updatedNodeOrErr.right.title).toBe("Updated Title");
		});

		it("should allow authorized group member to update", async () => {
			const context = createContext();
			const service = new NodeService(context);
			const authCtx1 = createAuthContext("user1@example.com", [Groups.ADMINS_GROUP_UUID]);
			const authCtx2 = createNonAdminAuthContext("user2@example.com", ["editors", "users"]);

			// Create a test folder, node and lock it
			const testFolderUuid = await createTestFolder(service, authCtx1);
			const nodeOrErr = await service.create(authCtx1, {
				title: "Test Node",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: testFolderUuid,
			});

			await service.lock(authCtx1, nodeOrErr.right.uuid, ["editors"]);

			// Update by authorized group member
			const updateOrErr = await service.update(authCtx2, nodeOrErr.right.uuid, {
				title: "Updated Title",
			});

			expect(updateOrErr.isRight()).toBe(true);
		});
	});

	describe("recursive folder locks", () => {
		async function createTree(service: NodeService, authCtx: AuthenticationContext) {
			const parentUuid = await createTestFolder(service, authCtx);
			const childFolder = await service.create(authCtx, {
				uuid: "child-folder",
				title: "Child Folder",
				mimetype: Nodes.FOLDER_MIMETYPE,
				parent: parentUuid,
				filters: [],
			});
			const grandchild = await service.create(authCtx, {
				uuid: "grandchild-node",
				title: "Grandchild",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: childFolder.right.uuid,
			});
			return {
				parentUuid,
				childFolderUuid: childFolder.right.uuid,
				grandchildUuid: grandchild.right.uuid,
			};
		}

		it("locks all descendants with the lock system user", async () => {
			const service = new NodeService(createContext());
			const authCtx = createAuthContext("owner@example.com");
			const tree = await createTree(service, authCtx);

			const result = await service.lock(authCtx, tree.parentUuid);

			expect(result.isRight()).toBe(true);
			const child = await service.get(authCtx, tree.childFolderUuid);
			const grandchild = await service.get(authCtx, tree.grandchildUuid);
			expect(child.right.locked).toBe(true);
			expect(child.right.lockedBy).toBe(Users.LOCK_SYSTEM_USER_EMAIL);
			expect(grandchild.right.locked).toBe(true);
			expect(grandchild.right.lockedBy).toBe(Users.LOCK_SYSTEM_USER_EMAIL);
		});

		it("rejects direct unlock of a descendant locked by the system", async () => {
			const service = new NodeService(createContext());
			const authCtx = createAuthContext("owner@example.com");
			const tree = await createTree(service, authCtx);
			await service.lock(authCtx, tree.parentUuid);

			const result = await service.unlock(authCtx, tree.childFolderUuid);

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("Unlock the parent folder instead");
			}
		});

		it("unlocks descendants when their parent folder is unlocked", async () => {
			const service = new NodeService(createContext());
			const authCtx = createAuthContext("owner@example.com");
			const tree = await createTree(service, authCtx);
			await service.lock(authCtx, tree.parentUuid);

			const result = await service.unlock(authCtx, tree.parentUuid);

			expect(result.isRight()).toBe(true);
			const child = await service.get(authCtx, tree.childFolderUuid);
			const grandchild = await service.get(authCtx, tree.grandchildUuid);
			expect(child.right.locked).toBe(false);
			expect(grandchild.right.locked).toBe(false);
		});

		it("preserves an independently locked child when unlocking the parent", async () => {
			const service = new NodeService(createContext());
			const parentCtx = createAuthContext("parent-owner@example.com");
			const childCtx = createAuthContext("child-owner@example.com");
			const parentUuid = await createTestFolder(service, parentCtx);
			const child = await service.create(parentCtx, {
				uuid: "independently-locked-child",
				title: "Independent child",
				mimetype: Nodes.META_NODE_MIMETYPE,
				parent: parentUuid,
			});
			await service.lock(childCtx, child.right.uuid);
			await service.lock(parentCtx, parentUuid);

			const result = await service.unlock(parentCtx, parentUuid);

			expect(result.isRight()).toBe(true);
			const persistedChild = await service.get(parentCtx, child.right.uuid);
			expect(persistedChild.right.locked).toBe(true);
			expect(persistedChild.right.lockedBy).toBe("child-owner@example.com");
		});
	});
});
