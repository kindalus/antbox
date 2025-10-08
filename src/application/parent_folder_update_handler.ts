import type { EventHandler } from "shared/event_handler.ts";
import type { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import type { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import type { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { Folders } from "domain/nodes/folders.ts";

/**
 * Event handler that updates parent folder modification times when nodes are created, updated, or deleted.
 * This ensures that parent folders reflect changes to their contents through their lastModified time.
 * For move operations, both the old and new parent folders are updated.
 */
export class ParentFolderUpdateHandler
	implements EventHandler<NodeCreatedEvent | NodeDeletedEvent | NodeUpdatedEvent> {
	constructor(private readonly context: NodeServiceContext) {}

	handle(event: NodeCreatedEvent | NodeDeletedEvent | NodeUpdatedEvent): void {
		// Handle async operations in a non-blocking way
		this.handleAsync(event).catch((error) => {
			console.error(
				`ParentFolderUpdateHandler: Error handling ${event.eventId}:`,
				error,
			);
		});
	}

	private async handleAsync(
		event: NodeCreatedEvent | NodeDeletedEvent | NodeUpdatedEvent,
	): Promise<void> {
		try {
			if (event.eventId === "NodeUpdatedEvent") {
				await this.handleNodeUpdated(event as NodeUpdatedEvent);
			} else {
				await this.handleNodeCreatedOrDeleted(event as NodeCreatedEvent | NodeDeletedEvent);
			}
		} catch (error) {
			// Log error but don't throw to avoid disrupting the main operation
			console.error(
				`ParentFolderUpdateHandler: Unexpected error handling ${event.eventId}:`,
				error,
			);
		}
	}

	private async handleNodeCreatedOrDeleted(
		event: NodeCreatedEvent | NodeDeletedEvent,
	): Promise<void> {
		const node = event.payload;
		const parentUuid = node.parent;
		await this.updateParentFolder(parentUuid, event.eventId);
	}

	private async handleNodeUpdated(event: NodeUpdatedEvent): Promise<void> {
		const { uuid, oldValues, newValues } = event.payload;

		// Check if the node was moved (parent changed)
		if (
			newValues.parent !== undefined && oldValues.parent !== newValues.parent
		) {
			// Node was moved - update both old and new parent folders
			console.debug(
				`ParentFolderUpdateHandler: Node moved from ${oldValues.parent} to ${newValues.parent}`,
			);

			// Update old parent folder
			await this.updateParentFolder(oldValues.parent!, event.eventId, "old parent");

			// Update new parent folder
			await this.updateParentFolder(newValues.parent, event.eventId, "new parent");
		} else {
			// For any other update, update the current parent folder
			// Any change to a child node should be reflected in the parent's modification time
			const updatedNode = await this.context.repository.getById(uuid);

			if (updatedNode.isLeft()) {
				console.debug();
				return;
			}

			await this.updateParentFolder(updatedNode.value.parent, event.eventId);
		}
	}

	private async updateParentFolder(
		parentUuid: string,
		eventType: string,
		context = "",
	): Promise<void> {
		// Don't update the root folder as it's a built-in folder
		if (parentUuid === Folders.ROOT_FOLDER_UUID) {
			return;
		}

		// Get the parent node from repository
		const parentOrErr = await this.context.repository.getById(parentUuid);
		if (parentOrErr.isLeft()) {
			// Parent not found - this could happen if parent was deleted
			// or if it's a built-in folder. Log but don't throw.
			console.warn(`ParentFolderUpdateHandler: Parent folder not found: ${parentUuid}`);
			return;
		}

		const parent = parentOrErr.value;

		// Update the parent's modification time
		const updateResult = parent.update({
			modifiedTime: new Date().toISOString(),
		});

		if (updateResult.isLeft()) {
			console.error(
				`ParentFolderUpdateHandler: Failed to update parent folder metadata: ${updateResult.value.message}`,
			);
			return;
		}

		// Save the updated parent to repository
		const saveResult = await this.context.repository.update(parent);
		if (saveResult.isLeft()) {
			console.error(
				`ParentFolderUpdateHandler: Failed to save updated parent folder: ${saveResult.value.message}`,
			);
			return;
		}

		const contextStr = context ? ` (${context})` : "";
		console.debug(
			`ParentFolderUpdateHandler: Updated modification time for parent folder ${parentUuid}${contextStr} after ${eventType}`,
		);
	}
}
