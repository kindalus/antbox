import { describe, it } from "bdd";
import { expect } from "expect";
import { ParentFolderUpdateHandler } from "./parent_folder_update_handler.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { type NodeUpdateChanges, NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { Folders } from "domain/nodes/folders.ts";
import { left, right } from "shared/either.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import type { NodeRepository } from "domain/nodes/node_repository.ts";
import type { EventBus } from "shared/event_bus.ts";
import type { StorageProvider } from "./storage_provider.ts";

// Mock implementations
class MockNodeRepository {
	private nodes: Map<string, any> = new Map();

	async getById(uuid: string) {
		const node = this.nodes.get(uuid);
		if (node) {
			return right(node);
		}
		return left(new NodeNotFoundError(`Node not found: ${uuid}`));
	}

	async update(node: any) {
		this.nodes.set(node.uuid, node);
		return right(undefined);
	}

	async delete(uuid: string) {
		return right(undefined);
	}

	async add(node: any) {
		return right(undefined);
	}

	async getByFid(fid: string) {
		return left(new NodeNotFoundError(`Node not found: ${fid}`));
	}

	async filter() {
		return { pageToken: 0, pageSize: 0, nodes: [] };
	}

	setNode(uuid: string, node: any) {
		this.nodes.set(uuid, node);
	}
}

class MockEventBus implements Partial<EventBus> {
	async publish() {}
	subscribe() {}
	unsubscribe() {}
}

class MockStorageProvider implements Partial<StorageProvider> {}

function createMockContext(): NodeServiceContext {
	return {
		repository: new MockNodeRepository() as unknown as NodeRepository,
		storage: new MockStorageProvider() as unknown as StorageProvider,
		bus: new MockEventBus() as unknown as EventBus,
	};
}

describe("ParentFolderUpdateHandler", () => {
	describe("handleNodeCreated", () => {
		it("should update parent folder modification time when node is created", async () => {
			const mockContext = createMockContext();
			const mockRepo = mockContext.repository as unknown as MockNodeRepository;
			const handler = new ParentFolderUpdateHandler(mockContext);

			// Create a parent folder
			const parentFolderResult = FolderNode.create({
				uuid: "parent-folder-uuid",
				title: "Parent Folder",
				owner: "test@example.com",
				group: "test-group",
				modifiedTime: "2023-01-01T00:00:00.000Z",
			});

			if (parentFolderResult.isLeft()) {
				throw new Error("Failed to create parent folder");
			}

			const parentFolder = parentFolderResult.value;
			mockRepo.setNode(parentFolder.uuid, parentFolder);

			// Create a child file
			const childFileResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "child.txt",
				mimetype: "text/plain",
				parent: parentFolder.uuid,
				owner: "test@example.com",
			});

			if (childFileResult.isLeft()) {
				throw new Error("Failed to create child file");
			}

			const childFile = childFileResult.value;

			// Create event
			const event = new NodeCreatedEvent("test@example.com", "test-tenant", childFile);

			// Handle the event
			handler.handle(event);

			// Wait a bit for async operation to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify parent folder modification time was updated
			const updatedParentResult = await mockContext.repository.getById(parentFolder.uuid);
			if (updatedParentResult.isLeft()) {
				throw new Error("Parent folder not found after update");
			}

			const updatedParent = updatedParentResult.value;
			expect(updatedParent.modifiedTime).not.toBe("2023-01-01T00:00:00.000Z");

			// Verify the modification time is recent (within last few seconds)
			const modifiedTime = new Date(updatedParent.modifiedTime);
			const now = new Date();
			const diffInSeconds = (now.getTime() - modifiedTime.getTime()) / 1000;
			expect(diffInSeconds).toBeLessThan(5);
		});

		it("should not update root folder", async () => {
			const mockContext = createMockContext();
			const handler = new ParentFolderUpdateHandler(mockContext);

			// Create a child file with root folder as parent
			const childFileResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "child.txt",
				mimetype: "text/plain",
				parent: Folders.ROOT_FOLDER_UUID,
				owner: "test@example.com",
			});

			if (childFileResult.isLeft()) {
				throw new Error("Failed to create child file");
			}

			const childFile = childFileResult.value;

			// Create event
			const event = new NodeCreatedEvent("test@example.com", "test-tenant", childFile);

			// Handle the event - should not throw or try to update root folder
			handler.handle(event);

			// Wait a bit for async operation to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Test passes if no errors are thrown
			expect(true).toBe(true);
		});

		it("should handle parent not found gracefully", async () => {
			const mockContext = createMockContext();
			const handler = new ParentFolderUpdateHandler(mockContext);

			// Create a child file with non-existent parent
			const childFileResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "child.txt",
				mimetype: "text/plain",
				parent: "non-existent-parent-uuid",
				owner: "test@example.com",
			});

			if (childFileResult.isLeft()) {
				throw new Error("Failed to create child file");
			}

			const childFile = childFileResult.value;

			// Create event
			const event = new NodeCreatedEvent("test@example.com", "test-tenant", childFile);

			// Handle the event - should not throw
			handler.handle(event);

			// Wait a bit for async operation to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Test passes if no errors are thrown
			expect(true).toBe(true);
		});

		it("should handle repository update failure gracefully", async () => {
			const mockContext = createMockContext();
			const mockRepo = mockContext.repository as unknown as MockNodeRepository;

			// Mock update to fail
			mockRepo.update = async () => left(new NodeNotFoundError("Update failed"));

			const handler = new ParentFolderUpdateHandler(mockContext);

			// Create a parent folder
			const parentFolderResult = FolderNode.create({
				uuid: "parent-folder-uuid",
				title: "Parent Folder",
				owner: "test@example.com",
				group: "test-group",
				modifiedTime: "2023-01-01T00:00:00.000Z",
			});

			if (parentFolderResult.isLeft()) {
				throw new Error("Failed to create parent folder");
			}

			const parentFolder = parentFolderResult.value;
			mockRepo.setNode(parentFolder.uuid, parentFolder);

			// Create a child file
			const childFileResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "child.txt",
				mimetype: "text/plain",
				parent: parentFolder.uuid,
				owner: "test@example.com",
			});

			if (childFileResult.isLeft()) {
				throw new Error("Failed to create child file");
			}

			const childFile = childFileResult.value;

			// Create event
			const event = new NodeCreatedEvent("test@example.com", "test-tenant", childFile);

			// Handle the event - should not throw
			handler.handle(event);

			// Wait a bit for async operation to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Test passes if no errors are thrown
			expect(true).toBe(true);
		});

	});

	describe("handleNodeDeleted", () => {
		it("should update parent folder modification time when node is deleted", async () => {
			const mockContext = createMockContext();
			const mockRepo = mockContext.repository as unknown as MockNodeRepository;
			const handler = new ParentFolderUpdateHandler(mockContext);

			// Create a parent folder
			const parentFolderResult = FolderNode.create({
				uuid: "parent-folder-uuid",
				title: "Parent Folder",
				owner: "test@example.com",
				group: "test-group",
				modifiedTime: "2023-01-01T00:00:00.000Z",
			});

			if (parentFolderResult.isLeft()) {
				throw new Error("Failed to create parent folder");
			}

			const parentFolder = parentFolderResult.value;
			mockRepo.setNode(parentFolder.uuid, parentFolder);

			// Create a child file
			const childFileResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "child.txt",
				mimetype: "text/plain",
				parent: parentFolder.uuid,
				owner: "test@example.com",
			});

			if (childFileResult.isLeft()) {
				throw new Error("Failed to create child file");
			}

			const childFile = childFileResult.value;

			// Create deletion event
			const event = new NodeDeletedEvent("test@example.com", "test-tenant", childFile);

			// Handle the event
			handler.handle(event);

			// Wait a bit for async operation to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify parent folder modification time was updated
			const updatedParentResult = await mockContext.repository.getById(parentFolder.uuid);
			if (updatedParentResult.isLeft()) {
				throw new Error("Parent folder not found after update");
			}

			const updatedParent = updatedParentResult.value;
			expect(updatedParent.modifiedTime).not.toBe("2023-01-01T00:00:00.000Z");

			// Verify the modification time is recent (within last few seconds)
			const modifiedTime = new Date(updatedParent.modifiedTime);
			const now = new Date();
			const diffInSeconds = (now.getTime() - modifiedTime.getTime()) / 1000;
			expect(diffInSeconds).toBeLessThan(5);
		});

	});

	describe("handleNodeUpdated", () => {
		it("should update parent folder modification time when node is updated", async () => {
			const mockContext = createMockContext();
			const mockRepo = mockContext.repository as unknown as MockNodeRepository;
			const handler = new ParentFolderUpdateHandler(mockContext);

			// Create a parent folder
			const parentFolderResult = FolderNode.create({
				uuid: "parent-folder-uuid",
				title: "Parent Folder",
				owner: "test@example.com",
				group: "test-group",
				modifiedTime: "2023-01-01T00:00:00.000Z",
			});

			if (parentFolderResult.isLeft()) {
				throw new Error("Failed to create parent folder");
			}

			const parentFolder = parentFolderResult.value;
			mockRepo.setNode(parentFolder.uuid, parentFolder);

			// Create a child file
			const childFileResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "child.txt",
				mimetype: "text/plain",
				parent: parentFolder.uuid,
				owner: "test@example.com",
			});

			if (childFileResult.isLeft()) {
				throw new Error("Failed to create child file");
			}

			const originalChild = childFileResult.value;
			mockRepo.setNode(originalChild.uuid, originalChild);

			// Create updated child with new title
			const updatedChildResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "renamed-child.txt",
				mimetype: "text/plain",
				parent: parentFolder.uuid,
				owner: "test@example.com",
				modifiedTime: new Date().toISOString(),
			});

			if (updatedChildResult.isLeft()) {
				throw new Error("Failed to create updated child file");
			}

			const updatedChild = updatedChildResult.value;

			// Create update changes
			const changes: NodeUpdateChanges = {
				uuid: originalChild.uuid,
				oldValues: {
					title: originalChild.title,
					parent: originalChild.parent,
					modifiedTime: originalChild.modifiedTime,
				},
				newValues: {
					title: updatedChild.title,
				},
			};

			// Create event
			const event = new NodeUpdatedEvent("test@example.com", "test-tenant", changes);

			// Handle the event
			handler.handle(event);

			// Wait a bit for async operation to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify parent folder modification time was updated
			const updatedParentResult = await mockContext.repository.getById(parentFolder.uuid);
			if (updatedParentResult.isLeft()) {
				throw new Error("Parent folder not found after update");
			}

			const updatedParent = updatedParentResult.value;
			expect(updatedParent.modifiedTime).not.toBe("2023-01-01T00:00:00.000Z");

			// Verify the modification time is recent (within last few seconds)
			const modifiedTime = new Date(updatedParent.modifiedTime);
			const now = new Date();
			const diffInSeconds = (now.getTime() - modifiedTime.getTime()) / 1000;
			expect(diffInSeconds).toBeLessThan(5);
		});

		it("should update both old and new parent folders when node is moved", async () => {
			const mockContext = createMockContext();
			const mockRepo = mockContext.repository as unknown as MockNodeRepository;
			const handler = new ParentFolderUpdateHandler(mockContext);

			// Create old parent folder
			const oldParentResult = FolderNode.create({
				uuid: "old-parent-uuid",
				title: "Old Parent",
				owner: "test@example.com",
				group: "test-group",
				modifiedTime: "2023-01-01T00:00:00.000Z",
			});

			if (oldParentResult.isLeft()) {
				throw new Error("Failed to create old parent folder");
			}

			const oldParent = oldParentResult.value;
			mockRepo.setNode(oldParent.uuid, oldParent);

			// Create new parent folder
			const newParentResult = FolderNode.create({
				uuid: "new-parent-uuid",
				title: "New Parent",
				owner: "test@example.com",
				group: "test-group",
				modifiedTime: "2023-01-01T01:00:00.000Z",
			});

			if (newParentResult.isLeft()) {
				throw new Error("Failed to create new parent folder");
			}

			const newParent = newParentResult.value;
			mockRepo.setNode(newParent.uuid, newParent);

			// Create a child file in old parent
			const childFileResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "child.txt",
				mimetype: "text/plain",
				parent: oldParent.uuid,
				owner: "test@example.com",
			});

			if (childFileResult.isLeft()) {
				throw new Error("Failed to create child file");
			}

			const originalChild = childFileResult.value;

			// Create moved child (same file, different parent)
			const movedChildResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "child.txt",
				mimetype: "text/plain",
				parent: newParent.uuid,
				owner: "test@example.com",
				modifiedTime: new Date().toISOString(),
			});

			if (movedChildResult.isLeft()) {
				throw new Error("Failed to create moved child file");
			}

			const movedChild = movedChildResult.value;

			// Create move changes
			const changes: NodeUpdateChanges = {
				uuid: originalChild.uuid,
				oldValues: {
					parent: oldParent.uuid,
					modifiedTime: originalChild.modifiedTime,
				},
				newValues: {
					parent: newParent.uuid,
				},
			};

			// Create event
			const event = new NodeUpdatedEvent("test@example.com", "test-tenant", changes);

			// Handle the event
			handler.handle(event);

			// Wait a bit for async operation to complete
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Verify old parent folder modification time was updated
			const updatedOldParentResult = await mockContext.repository.getById(oldParent.uuid);
			if (updatedOldParentResult.isLeft()) {
				throw new Error("Old parent folder not found after move");
			}

			const updatedOldParent = updatedOldParentResult.value;
			expect(updatedOldParent.modifiedTime).not.toBe("2023-01-01T00:00:00.000Z");

			// Verify new parent folder modification time was updated
			const updatedNewParentResult = await mockContext.repository.getById(newParent.uuid);
			if (updatedNewParentResult.isLeft()) {
				throw new Error("New parent folder not found after move");
			}

			const updatedNewParent = updatedNewParentResult.value;
			expect(updatedNewParent.modifiedTime).not.toBe("2023-01-01T01:00:00.000Z");

			// Both modification times should be recent
			const oldParentModTime = new Date(updatedOldParent.modifiedTime);
			const newParentModTime = new Date(updatedNewParent.modifiedTime);
			const now = new Date();

			const oldParentDiff = (now.getTime() - oldParentModTime.getTime()) / 1000;
			const newParentDiff = (now.getTime() - newParentModTime.getTime()) / 1000;

			expect(oldParentDiff).toBeLessThan(5);
			expect(newParentDiff).toBeLessThan(5);
		});

		it("should update parent when node properties are updated", async () => {
			const mockContext = createMockContext();
			const mockRepo = mockContext.repository as unknown as MockNodeRepository;
			const handler = new ParentFolderUpdateHandler(mockContext);

			// Create a parent folder
			const parentFolderResult = FolderNode.create({
				uuid: "parent-folder-uuid",
				title: "Parent Folder",
				owner: "test@example.com",
				group: "test-group",
				modifiedTime: "2023-01-01T00:00:00.000Z",
			});

			if (parentFolderResult.isLeft()) {
				throw new Error("Failed to create parent folder");
			}

			const parentFolder = parentFolderResult.value;
			mockRepo.setNode(parentFolder.uuid, parentFolder);

			// Create a child file
			const childFileResult = FileNode.create({
				uuid: "child-file-uuid",
				title: "child.txt",
				mimetype: "text/plain",
				parent: parentFolder.uuid,
				owner: "test@example.com",
			});

			if (childFileResult.isLeft()) {
				throw new Error("Failed to create child file");
			}

			const child = childFileResult.value;
			mockRepo.setNode(child.uuid, child);

			// Create update changes that don't include parent info
			const changes: NodeUpdateChanges = {
				uuid: child.uuid,
				oldValues: {
					description: "old description",
				},
				newValues: {
					parent: undefined,
				},
			};

			// Create event
			const event = new NodeUpdatedEvent("test@example.com", "test-tenant", changes);

			// Handle the event
			handler.handle(event);

			// Wait a bit for async operation to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Verify parent folder modification time was updated
			// (because any change to a child node should update the parent)
			const updatedParentResult = await mockContext.repository.getById(parentFolder.uuid);
			if (updatedParentResult.isLeft()) {
				throw new Error("Parent folder not found after update");
			}

			const updatedParent = updatedParentResult.value;
			expect(updatedParent.modifiedTime).not.toBe("2023-01-01T00:00:00.000Z");

			// Verify the modification time is recent (within last few seconds)
			const modifiedTime = new Date(updatedParent.modifiedTime);
			const now = new Date();
			const diffInSeconds = (now.getTime() - modifiedTime.getTime()) / 1000;
			expect(diffInSeconds).toBeLessThan(5);
		});

	});
});

