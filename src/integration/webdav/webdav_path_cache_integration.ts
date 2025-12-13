/**
 * WebDAV Path Cache Integration Example
 *
 * This file demonstrates how to integrate the path cache with:
 * 1. The resolvePath function in webdav_utils.ts
 * 2. NodeService mutations for automatic invalidation
 * 3. Monitoring and statistics endpoints
 */

import { type Either, left, right } from "shared/either.ts";
import { type Node } from "domain/nodes/node.ts";
import { type NodeService } from "application/node_service.ts";
import { type AuthenticationContext } from "domain/users_groups/authentication_context.ts";
import { type AntboxError } from "shared/antbox_error.ts";
import { webdavPathCache } from "./webdav_path_cache.ts";

/**
 * EXAMPLE 1: Cache-enabled path resolution
 *
 * Replace the existing resolvePath in webdav_utils.ts with this:
 */
export async function resolvePathCached(
	nodeService: NodeService,
	authContext: AuthenticationContext,
	path: string,
	tenantName: string,
): Promise<Either<AntboxError, Node>> {
	// Normalize path
	const normalizedPath = path === "" ? "/" : path;

	// Try cache first
	const cached = webdavPathCache.get(tenantName, authContext.principal.email, normalizedPath);
	if (cached) {
		// Verify user still has access (security check)
		const verifyResult = await nodeService.get(authContext, cached.uuid);
		if (verifyResult.isRight()) {
			return right(cached);
		}
		// Access denied or node deleted - invalidate cache
		webdavPathCache.invalidatePath(tenantName, normalizedPath);
	}

	// Cache miss - resolve from database
	// Root path
	if (normalizedPath === "/") {
		const rootResult = await nodeService.getRoot(authContext);
		if (rootResult.isRight()) {
			webdavPathCache.set(tenantName, authContext.principal.email, "/", rootResult.value);
		}
		return rootResult;
	}

	// Split path and resolve iteratively
	const segments = normalizedPath.split("/").filter((s) => s.length > 0);
	let currentNode = (await nodeService.getRoot(authContext)).value as Node;
	let currentPath = "";

	for (const segment of segments) {
		currentPath += `/${segment}`;

		// Check cache for intermediate paths
		const cachedSegment = webdavPathCache.get(
			tenantName,
			authContext.principal.email,
			currentPath,
		);
		if (cachedSegment) {
			currentNode = cachedSegment;
			continue;
		}

		// Resolve this segment
		const childrenResult = await nodeService.list(authContext, currentNode.uuid);
		if (childrenResult.isLeft()) {
			return left(childrenResult.value);
		}

		const child = childrenResult.value.find(
			(n) => n.title === decodeURIComponent(segment),
		);

		if (!child) {
			return left({
				errorCode: "NodeNotFound",
				message: `Path not found: ${currentPath}`,
			} as AntboxError);
		}

		currentNode = child;

		// Cache this intermediate path
		webdavPathCache.set(tenantName, authContext.principal.email, currentPath, currentNode);
	}

	return right(currentNode);
}

/**
 * EXAMPLE 2: NodeService wrapper with automatic cache invalidation
 *
 * Wrap NodeService methods to automatically invalidate cache on mutations.
 */
export class CachedNodeServiceWrapper {
	readonly #nodeService: NodeService;
	readonly #tenantName: string;

	constructor(nodeService: NodeService, tenantName: string) {
		this.#nodeService = nodeService;
		this.#tenantName = tenantName;
	}

	/**
	 * Get node (no invalidation needed)
	 */
	async get(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, Node>> {
		return await this.#nodeService.get(ctx, uuid);
	}

	/**
	 * Create node - invalidate parent path
	 */
	async create(
		ctx: AuthenticationContext,
		metadata: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		const result = await this.#nodeService.create(ctx, metadata);

		if (result.isRight() && metadata.parent) {
			// Invalidate parent folder (new child added)
			webdavPathCache.invalidateByUUID(this.#tenantName, metadata.parent);
		}

		return result;
	}

	/**
	 * Update node - invalidate node and parent if moved
	 */
	async update(
		ctx: AuthenticationContext,
		uuid: string,
		updates: Partial<Node>,
	): Promise<Either<AntboxError, Node>> {
		// Get current node to check if it's being moved
		const currentResult = await this.#nodeService.get(ctx, uuid);
		if (currentResult.isLeft()) {
			return currentResult;
		}

		const current = currentResult.value;
		const result = await this.#nodeService.update(ctx, uuid, updates);

		if (result.isRight()) {
			// Invalidate the node itself
			webdavPathCache.invalidateByUUID(this.#tenantName, uuid);

			// If moved (parent changed), invalidate both old and new parent
			if (updates.parent && updates.parent !== current.parent) {
				webdavPathCache.invalidateByUUID(this.#tenantName, current.parent);
				webdavPathCache.invalidateByUUID(this.#tenantName, updates.parent);
			}

			// If renamed (title changed), invalidate parent
			if (updates.title && updates.title !== current.title) {
				webdavPathCache.invalidateByUUID(this.#tenantName, current.parent);
			}
		}

		return result;
	}

	/**
	 * Delete node - invalidate node and parent
	 */
	async delete(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, void>> {
		// Get node before deletion to know parent
		const nodeResult = await this.#nodeService.get(ctx, uuid);
		if (nodeResult.isLeft()) {
			return left(nodeResult.value);
		}

		const node = nodeResult.value;
		const result = await this.#nodeService.delete(ctx, uuid);

		if (result.isRight()) {
			// Invalidate the deleted node
			webdavPathCache.invalidateByUUID(this.#tenantName, uuid);

			// Invalidate parent (child removed)
			webdavPathCache.invalidateByUUID(this.#tenantName, node.parent);
		}

		return result;
	}

	/**
	 * Copy node - invalidate destination parent
	 */
	async copy(
		ctx: AuthenticationContext,
		sourceUuid: string,
		destParentUuid: string,
	): Promise<Either<AntboxError, Node>> {
		const result = await this.#nodeService.copy(ctx, sourceUuid, destParentUuid);

		if (result.isRight()) {
			// Invalidate destination parent (new child added)
			webdavPathCache.invalidateByUUID(this.#tenantName, destParentUuid);
		}

		return result;
	}

	/**
	 * Lock node - no cache invalidation needed (metadata only)
	 */
	async lock(
		ctx: AuthenticationContext,
		uuid: string,
		groups: string[],
	): Promise<Either<AntboxError, void>> {
		return await this.#nodeService.lock(ctx, uuid, groups);
	}

	/**
	 * Unlock node - no cache invalidation needed (metadata only)
	 */
	async unlock(ctx: AuthenticationContext, uuid: string): Promise<Either<AntboxError, void>> {
		return await this.#nodeService.unlock(ctx, uuid);
	}

	// Delegate other methods...
	getRoot(ctx: AuthenticationContext): Promise<Either<AntboxError, Node>> {
		return this.#nodeService.getRoot(ctx);
	}

	list(ctx: AuthenticationContext, parentUuid: string): Promise<Either<AntboxError, Node[]>> {
		return this.#nodeService.list(ctx, parentUuid);
	}
}

/**
 * EXAMPLE 3: Alternative approach - Invalidation hooks
 *
 * Instead of wrapping NodeService, you can add invalidation hooks at the application layer.
 */
export class PathCacheInvalidator {
	readonly #tenantName: string;

	constructor(tenantName: string) {
		this.#tenantName = tenantName;
	}

	/**
	 * Hook: After node created
	 */
	onNodeCreated(node: Node): void {
		// Invalidate parent folder
		webdavPathCache.invalidateByUUID(this.#tenantName, node.parent);
	}

	/**
	 * Hook: After node updated
	 */
	onNodeUpdated(oldNode: Node, newNode: Node): void {
		// Invalidate the node itself
		webdavPathCache.invalidateByUUID(this.#tenantName, newNode.uuid);

		// If moved, invalidate both parents
		if (oldNode.parent !== newNode.parent) {
			webdavPathCache.invalidateByUUID(this.#tenantName, oldNode.parent);
			webdavPathCache.invalidateByUUID(this.#tenantName, newNode.parent);
		}

		// If renamed, invalidate parent
		if (oldNode.title !== newNode.title) {
			webdavPathCache.invalidateByUUID(this.#tenantName, newNode.parent);
		}
	}

	/**
	 * Hook: After node deleted
	 */
	onNodeDeleted(node: Node): void {
		// Invalidate the deleted node
		webdavPathCache.invalidateByUUID(this.#tenantName, node.uuid);

		// Invalidate parent
		webdavPathCache.invalidateByUUID(this.#tenantName, node.parent);
	}

	/**
	 * Hook: After node copied
	 */
	onNodeCopied(sourceNode: Node, newNode: Node): void {
		// Invalidate destination parent
		webdavPathCache.invalidateByUUID(this.#tenantName, newNode.parent);
	}

	/**
	 * Hook: After node moved
	 */
	onNodeMoved(oldParentUuid: string, newParentUuid: string, node: Node): void {
		// Invalidate the moved node
		webdavPathCache.invalidateByUUID(this.#tenantName, node.uuid);

		// Invalidate both old and new parents
		webdavPathCache.invalidateByUUID(this.#tenantName, oldParentUuid);
		webdavPathCache.invalidateByUUID(this.#tenantName, newParentUuid);
	}
}

/**
 * EXAMPLE 4: Monitoring endpoint for cache statistics
 *
 * Add this to your admin/monitoring API:
 */
export function getCacheStatsHandler() {
	const stats = webdavPathCache.getStats();

	return {
		cache: {
			...stats,
			maxSize: webdavPathCache.maxSize,
			utilization: (stats.size / webdavPathCache.maxSize) * 100,
			ttlMs: webdavPathCache.ttl,
		},
		recommendations: generateRecommendations(stats),
	};
}

function generateRecommendations(stats: { hitRate: number; size: number }) {
	const recommendations: string[] = [];

	if (stats.hitRate < 0.5) {
		recommendations.push("Cache hit rate is low (<50%). Consider increasing TTL.");
	}

	if (stats.hitRate > 0.95) {
		recommendations.push(
			"Cache hit rate is very high (>95%). Consider reducing maxEntries to save memory.",
		);
	}

	if (stats.size < 100) {
		recommendations.push("Cache size is very small. Consider warming up the cache.");
	}

	return recommendations;
}

/**
 * EXAMPLE 5: Cache warming on server startup
 *
 * Pre-populate cache with frequently accessed paths:
 */
export async function warmupCache(
	nodeService: NodeService,
	authContext: AuthenticationContext,
	tenantName: string,
) {
	console.log(`[WebDAV Cache] Warming up cache for tenant: ${tenantName}`);

	// Warm up root
	const rootResult = await nodeService.getRoot(authContext);
	if (rootResult.isRight()) {
		webdavPathCache.set(tenantName, authContext.principal.email, "/", rootResult.value);

		// Warm up first-level folders
		const childrenResult = await nodeService.list(authContext, rootResult.value.uuid);
		if (childrenResult.isRight()) {
			for (const child of childrenResult.value) {
				const path = `/${child.title}`;
				webdavPathCache.set(tenantName, authContext.principal.email, path, child);
			}
		}
	}

	const stats = webdavPathCache.getStats();
	console.log(`[WebDAV Cache] Warmup complete. Cache size: ${stats.size}`);
}
