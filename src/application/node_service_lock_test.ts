import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import { NodeService } from "./node_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { InMemoryStorageProvider } from "adapters/inmem/inmem_storage_provider.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { Event } from "shared/event.ts";
import type { EventHandler } from "shared/event_handler.ts";
import type { AuthenticationContext } from "./authentication_context.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";

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
		};
	}

	function createAuthContext(email: string, groups: string[] = [Groups.ADMINS_GROUP_UUID]): AuthenticationContext {
		return {
			principal: {
				email,
				groups,
			},
			tenant: "test-tenant",
			mode: "Direct",
		};
	}

	function createNonAdminAuthContext(email: string, groups: string[] = ["users"]): AuthenticationContext {
		return {
			principal: {
				email,
				groups,
			},
			tenant: "test-tenant",
			mode: "Direct",
		};
	}

	async function createTestFolder(service: NodeService, authCtx: AuthenticationContext): Promise<string> {
		const folderOrErr = await service.create(authCtx, {
			title: "Test Folder",
			mimetype: Nodes.FOLDER_MIMETYPE,
			parent: Folders.ROOT_FOLDER_UUID,
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
});
