import { Logger } from "shared/logger.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";

/**
 * Cache entry with timestamp for TTL and LRU tracking
 */
interface CacheEntry {
	node: NodeMetadata;
	timestamp: number;
	lastAccess: number;
	tenantName: string;
	userId: string;
}

/**
 * Cache key that includes tenant and user for isolation
 */
interface CacheKey {
	tenantName: string;
	userId: string;
	path: string;
}

/**
 * Cache statistics for monitoring
 */
interface CacheStats {
	hits: number;
	misses: number;
	evictions: number;
	invalidations: number;
	size: number;
	hitRate: number;
}

/**
 * Configuration options for the path cache
 */
export interface PathCacheConfig {
	/** Maximum number of entries in cache (default: 10000) */
	maxEntries?: number;
	/** Time to live in milliseconds (default: 5 minutes) */
	ttlMs?: number;
	/** Enable tenant isolation (default: true) */
	tenantIsolation?: boolean;
	/** Enable user-specific caching (default: false) */
	userIsolation?: boolean;
}

/**
 * LRU cache with TTL for WebDAV path resolution
 *
 * Features:
 * - LRU eviction when cache is full
 * - TTL-based expiration
 * - Tenant isolation (multi-tenant safe)
 * - Optional user isolation (for permission-sensitive paths)
 * - Path invalidation on mutations
 * - Performance statistics
 *
 * Usage:
 * ```typescript
 * const cache = new WebDAVPathCache({ maxEntries: 10000, ttlMs: 300000 });
 *
 * // Try to get from cache
 * const node = cache.get("acme", "user@example.com", "/folder/file.txt");
 * if (!node) {
 *   // Cache miss - resolve from database
 *   const resolved = await resolvePath(...);
 *   cache.set("acme", "user@example.com", "/folder/file.txt", resolved);
 * }
 *
 * // Invalidate on mutations
 * cache.invalidatePath("acme", "/folder/file.txt");
 * cache.invalidatePrefix("acme", "/folder"); // Invalidates all children
 * ```
 */
export class WebDAVPathCache {
	readonly #cache: Map<string, CacheEntry>;
	readonly #maxEntries: number;
	readonly #ttlMs: number;
	readonly #tenantIsolation: boolean;
	readonly #userIsolation: boolean;
	#accessCounter = 0;

	// Statistics
	#hits = 0;
	#misses = 0;
	#evictions = 0;
	#invalidations = 0;

	constructor(config: PathCacheConfig = {}) {
		this.#cache = new Map();
		this.#maxEntries = config.maxEntries ?? 10000;
		this.#ttlMs = config.ttlMs ?? 300000; // 5 minutes default
		this.#tenantIsolation = config.tenantIsolation ?? true;
		this.#userIsolation = config.userIsolation ?? false;
	}

	/**
	 * Generate cache key from tenant, user, and path
	 */
	#makeKey(tenantName: string, userId: string, path: string): string {
		if (this.#userIsolation) {
			return `${tenantName}:${userId}:${path}`;
		}
		return `${tenantName}:${path}`;
	}

	/**
	 * Check if entry is expired based on TTL
	 */
	#isExpired(entry: CacheEntry): boolean {
		const now = Date.now();
		return (now - entry.timestamp) > this.#ttlMs;
	}

	#nextAccess(): number {
		this.#accessCounter++;
		return this.#accessCounter;
	}

	/**
	 * Evict least recently used entry when cache is full
	 */
	#evictLRU(): void {
		let oldestKey: string | null = null;
		let oldestAccess = Infinity;

		for (const [key, entry] of this.#cache.entries()) {
			if (entry.lastAccess < oldestAccess) {
				oldestAccess = entry.lastAccess;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.#cache.delete(oldestKey);
			this.#evictions++;
		}
	}

	/**
	 * Get node from cache by path
	 *
	 * @param tenantName - Tenant identifier
	 * @param userId - User email for isolation (if enabled)
	 * @param path - Path to resolve (e.g., "/folder/file.txt")
	 * @returns Cached node or undefined if not found/expired
	 */
	get(tenantName: string, userId: string, path: string): NodeMetadata | undefined {
		const key = this.#makeKey(tenantName, userId, path);
		const entry = this.#cache.get(key);

		if (!entry) {
			this.#misses++;
			return undefined;
		}

		// Check if expired
		if (this.#isExpired(entry)) {
			this.#cache.delete(key);
			this.#misses++;
			return undefined;
		}

		// Update last access time for LRU
		entry.lastAccess = this.#nextAccess();
		this.#hits++;

		return entry.node;
	}

	/**
	 * Store node in cache by path
	 *
	 * @param tenantName - Tenant identifier
	 * @param userId - User email for isolation (if enabled)
	 * @param path - Path to cache (e.g., "/folder/file.txt")
	 * @param node - Node to cache
	 */
	set(tenantName: string, userId: string, path: string, node: NodeMetadata): void {
		const key = this.#makeKey(tenantName, userId, path);

		// Evict if cache is full
		if (this.#cache.size >= this.#maxEntries && !this.#cache.has(key)) {
			this.#evictLRU();
		}

		const now = Date.now();
		const lastAccess = this.#nextAccess();
		this.#cache.set(key, {
			node,
			timestamp: now,
			lastAccess,
			tenantName,
			userId,
		});
	}

	/**
	 * Invalidate a specific path
	 *
	 * Use when a node is updated, deleted, or moved.
	 *
	 * @param tenantName - Tenant identifier
	 * @param path - Path to invalidate (e.g., "/folder/file.txt")
	 */
	invalidatePath(tenantName: string, path: string): void {
		// Invalidate for all users if user isolation is enabled
		if (this.#userIsolation) {
			const prefix = `${tenantName}:`;
			const suffix = `:${path}`;
			for (const key of this.#cache.keys()) {
				if (key.startsWith(prefix) && key.endsWith(suffix)) {
					this.#cache.delete(key);
					this.#invalidations++;
				}
			}
		} else {
			const key = `${tenantName}:${path}`;
			if (this.#cache.delete(key)) {
				this.#invalidations++;
			}
		}
	}

	/**
	 * Invalidate all paths under a prefix (folder and all children)
	 *
	 * Use when a folder is deleted or moved.
	 *
	 * @param tenantName - Tenant identifier
	 * @param pathPrefix - Path prefix to invalidate (e.g., "/folder")
	 */
	invalidatePrefix(tenantName: string, pathPrefix: string): void {
		// Normalize prefix to ensure it ends with /
		const normalizedPrefix = pathPrefix.endsWith("/") ? pathPrefix : `${pathPrefix}/`;

		const toDelete: string[] = [];

		for (const [key, entry] of this.#cache.entries()) {
			if (entry.tenantName !== tenantName) continue;

			// Extract path from key
			const parts = key.split(":");
			const path = this.#userIsolation ? parts[2] : parts[1];

			// Check if path starts with prefix or is exactly the prefix (without trailing /)
			if (path.startsWith(normalizedPrefix) || path === pathPrefix) {
				toDelete.push(key);
			}
		}

		for (const key of toDelete) {
			this.#cache.delete(key);
			this.#invalidations++;
		}
	}

	/**
	 * Invalidate by node UUID
	 *
	 * Use when you have the UUID but not the path (e.g., direct node updates).
	 * Less efficient than path-based invalidation.
	 *
	 * @param tenantName - Tenant identifier
	 * @param uuid - Node UUID to invalidate
	 */
	invalidateByUUID(tenantName: string, uuid: string): void {
		const toDelete: string[] = [];

		for (const [key, entry] of this.#cache.entries()) {
			if (entry.tenantName === tenantName && entry.node.uuid === uuid) {
				toDelete.push(key);
			}
		}

		for (const key of toDelete) {
			this.#cache.delete(key);
			this.#invalidations++;
		}
	}

	/**
	 * Invalidate entire tenant cache
	 *
	 * Use when tenant is deleted or during maintenance.
	 *
	 * @param tenantName - Tenant identifier
	 */
	invalidateTenant(tenantName: string): void {
		const toDelete: string[] = [];

		for (const [key, entry] of this.#cache.entries()) {
			if (entry.tenantName === tenantName) {
				toDelete.push(key);
			}
		}

		for (const key of toDelete) {
			this.#cache.delete(key);
			this.#invalidations++;
		}
	}

	/**
	 * Clear entire cache
	 */
	clear(): void {
		const size = this.#cache.size;
		this.#cache.clear();
		this.#invalidations += size;
	}

	/**
	 * Remove expired entries (cleanup task)
	 *
	 * Should be called periodically (e.g., every minute).
	 */
	evictExpired(): number {
		const toDelete: string[] = [];

		for (const [key, entry] of this.#cache.entries()) {
			if (this.#isExpired(entry)) {
				toDelete.push(key);
			}
		}

		for (const key of toDelete) {
			this.#cache.delete(key);
			this.#evictions++;
		}

		return toDelete.length;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		const total = this.#hits + this.#misses;
		return {
			hits: this.#hits,
			misses: this.#misses,
			evictions: this.#evictions,
			invalidations: this.#invalidations,
			size: this.#cache.size,
			hitRate: total > 0 ? this.#hits / total : 0,
		};
	}

	/**
	 * Reset statistics counters
	 */
	resetStats(): void {
		this.#hits = 0;
		this.#misses = 0;
		this.#evictions = 0;
		this.#invalidations = 0;
	}

	/**
	 * Get current cache size
	 */
	get size(): number {
		return this.#cache.size;
	}

	/**
	 * Get maximum cache size
	 */
	get maxSize(): number {
		return this.#maxEntries;
	}

	/**
	 * Get TTL in milliseconds
	 */
	get ttl(): number {
		return this.#ttlMs;
	}
}

/**
 * Global cache instance (singleton)
 *
 * Can be configured at startup:
 * ```typescript
 * export const webdavPathCache = new WebDAVPathCache({
 *   maxEntries: 50000,
 *   ttlMs: 600000, // 10 minutes
 *   userIsolation: false, // Share cache across users
 * });
 * ```
 */
export const webdavPathCache = new WebDAVPathCache();

/**
 * Start periodic cleanup task
 *
 * Call at server startup:
 * ```typescript
 * startPathCacheCleanup(60000); // Cleanup every minute
 * ```
 */
export function startPathCacheCleanup(intervalMs = 60000): number {
	return setInterval(() => {
		const evicted = webdavPathCache.evictExpired();
		if (evicted > 0) {
			Logger.info(`[WebDAV Cache] Evicted ${evicted} expired entries`);
		}
	}, intervalMs);
}
