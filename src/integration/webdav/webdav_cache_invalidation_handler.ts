/**
 * Event handler for automatic WebDAV path cache invalidation
 *
 * Subscribes to node mutation events (create, update, delete) and
 * automatically invalidates the WebDAV path cache to maintain consistency.
 */

import { type Event } from "shared/event.ts";
import { NodeCreatedEvent } from "domain/nodes/node_created_event.ts";
import { NodeUpdatedEvent } from "domain/nodes/node_updated_event.ts";
import { NodeDeletedEvent } from "domain/nodes/node_deleted_event.ts";
import { webdavPathCache } from "./webdav_path_cache.ts";

/**
 * Handler for NodeCreatedEvent
 *
 * Invalidates the parent folder when a new node is created.
 */
export function handleNodeCreated(event: Event): void {
	if (event.eventId !== NodeCreatedEvent.EVENT_ID) return;

	const nodeCreated = event as NodeCreatedEvent;
	const node = nodeCreated.payload;

	// Invalidate parent folder (new child added)
	webdavPathCache.invalidateByUUID(nodeCreated.tenant, node.parent);
}

/**
 * Handler for NodeUpdatedEvent
 *
 * Invalidates the node and potentially the parent folders if the node was moved or renamed.
 */
export function handleNodeUpdated(event: Event): void {
	if (event.eventId !== NodeUpdatedEvent.EVENT_ID) return;

	const nodeUpdated = event as NodeUpdatedEvent;
	const changes = nodeUpdated.payload;
	const oldValues = changes.oldValues;
	const newValues = changes.newValues;

	// Always invalidate the node itself
	webdavPathCache.invalidateByUUID(nodeUpdated.tenant, changes.uuid);

	// If moved (parent changed), invalidate both old and new parent
	if (oldValues.parent && newValues.parent && oldValues.parent !== newValues.parent) {
		webdavPathCache.invalidateByUUID(nodeUpdated.tenant, oldValues.parent);
		webdavPathCache.invalidateByUUID(nodeUpdated.tenant, newValues.parent);
	}

	// If renamed (title changed), invalidate parent
	if (oldValues.title && newValues.title && oldValues.title !== newValues.title) {
		// Invalidate parent if it exists in either old or new values
		const parent = newValues.parent ?? oldValues.parent;
		if (parent) {
			webdavPathCache.invalidateByUUID(nodeUpdated.tenant, parent);
		}
	}
}

/**
 * Handler for NodeDeletedEvent
 *
 * Invalidates the deleted node and its parent folder.
 */
export function handleNodeDeleted(event: Event): void {
	if (event.eventId !== NodeDeletedEvent.EVENT_ID) return;

	const nodeDeleted = event as NodeDeletedEvent;
	const node = nodeDeleted.payload;

	// Invalidate the deleted node
	webdavPathCache.invalidateByUUID(nodeDeleted.tenant, node.uuid);

	// Invalidate parent (child removed)
	webdavPathCache.invalidateByUUID(nodeDeleted.tenant, node.parent);
}

/**
 * Register all cache invalidation handlers with the event bus
 *
 * Call this once during server startup:
 *
 * ```typescript
 * import { registerCacheInvalidationHandlers } from "./webdav_cache_invalidation_handler.ts";
 *
 * // In setup_tenants.ts or server startup
 * for (const tenant of tenants) {
 *   registerCacheInvalidationHandlers(tenant.bus);
 * }
 * ```
 */
export function registerCacheInvalidationHandlers(bus: { subscribe: (eventId: string, handler: (event: Event) => void) => void }): void {
	bus.subscribe(NodeCreatedEvent.EVENT_ID, handleNodeCreated);
	bus.subscribe(NodeUpdatedEvent.EVENT_ID, handleNodeUpdated);
	bus.subscribe(NodeDeletedEvent.EVENT_ID, handleNodeDeleted);
}
