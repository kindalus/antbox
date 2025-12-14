/**
 * WebDAV Path Cache Tests
 *
 * Demonstrates comprehensive testing of the path cache implementation.
 */

import { describe, it } from "bdd";
import { expect } from "expect";
import { WebDAVPathCache } from "./webdav_path_cache.ts";
import { Users } from "domain/users_groups/users.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";

// Mock node factory
function createMockNode(uuid: string, title: string, parent: string): NodeMetadata {
	const now = new Date().toISOString();
	return {
		uuid,
		fid: uuid,
		title,
		description: undefined,
		parent,
		mimetype: "text/plain",
		createdTime: now,
		modifiedTime: now,
		owner: Users.ROOT_USER_EMAIL,
		fulltext: "",
	};
}

describe("WebDAVPathCache", () => {
	it("basic get/set", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100, ttlMs: 60000 });
		const node = createMockNode("uuid-1", "file.txt", "parent-1");

		// Cache miss
		const miss = cache.get("tenant1", "user@example.com", "/folder/file.txt");
		expect(miss).toBeUndefined();

		// Store in cache
		cache.set("tenant1", "user@example.com", "/folder/file.txt", node);

		// Cache hit
		const hit = cache.get("tenant1", "user@example.com", "/folder/file.txt");
		expect(hit?.uuid).toBe("uuid-1");

		// Stats should show 1 hit and 1 miss
		const stats = cache.getStats();
		expect(stats.hits).toBe(1);
		expect(stats.misses).toBe(1);
		expect(stats.size).toBe(1);
		expect(stats.hitRate).toBe(0.5); // 1 hit out of 2 total accesses
	});

	it("tenant isolation", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100 });
		const node1 = createMockNode("uuid-1", "file.txt", "parent-1");
		const node2 = createMockNode("uuid-2", "file.txt", "parent-2");

		// Same path, different tenants
		cache.set("tenant1", "user@example.com", "/file.txt", node1);
		cache.set("tenant2", "user@example.com", "/file.txt", node2);

		const result1 = cache.get("tenant1", "user@example.com", "/file.txt");
		const result2 = cache.get("tenant2", "user@example.com", "/file.txt");

		expect(result1?.uuid).toBe("uuid-1");
		expect(result2?.uuid).toBe("uuid-2");
		expect(cache.size).toBe(2);
	});

	it("user isolation enabled", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100, userIsolation: true });
		const node1 = createMockNode("uuid-1", "file.txt", "parent-1");
		const node2 = createMockNode("uuid-2", "file.txt", "parent-2");

		// Same path and tenant, different users
		cache.set("tenant1", "user1@example.com", "/file.txt", node1);
		cache.set("tenant1", "user2@example.com", "/file.txt", node2);

		const result1 = cache.get("tenant1", "user1@example.com", "/file.txt");
		const result2 = cache.get("tenant1", "user2@example.com", "/file.txt");

		expect(result1?.uuid).toBe("uuid-1");
		expect(result2?.uuid).toBe("uuid-2");
		expect(cache.size).toBe(2);
	});

	it("user isolation disabled (shared cache)", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100, userIsolation: false });
		const node1 = createMockNode("uuid-1", "file.txt", "parent-1");

		// Same path and tenant, different users - should share cache entry
		cache.set("tenant1", "user1@example.com", "/file.txt", node1);

		const result2 = cache.get("tenant1", "user2@example.com", "/file.txt");
		expect(result2?.uuid).toBe("uuid-1"); // Gets same node
		expect(cache.size).toBe(1); // Only one entry
	});

	it("TTL expiration", async () => {
		const cache = new WebDAVPathCache({ maxEntries: 100, ttlMs: 50 }); // 50ms TTL
		const node = createMockNode("uuid-1", "file.txt", "parent-1");

		cache.set("tenant1", "user@example.com", "/file.txt", node);

		// Immediate access - should hit
		const hit = cache.get("tenant1", "user@example.com", "/file.txt");
		expect(hit).toBeDefined();

		// Wait for TTL to expire
		await new Promise((resolve) => setTimeout(resolve, 60));

		// Access after expiration - should miss
		const miss = cache.get("tenant1", "user@example.com", "/file.txt");
		expect(miss).toBeUndefined();
		expect(cache.size).toBe(0); // Entry auto-removed
	});

	it("LRU eviction", () => {
		const cache = new WebDAVPathCache({ maxEntries: 3, ttlMs: 60000 });

		// Fill cache to capacity
		cache.set(
			"tenant1",
			"user@example.com",
			"/file1.txt",
			createMockNode("uuid-1", "file1", "p"),
		);
		cache.set(
			"tenant1",
			"user@example.com",
			"/file2.txt",
			createMockNode("uuid-2", "file2", "p"),
		);
		cache.set(
			"tenant1",
			"user@example.com",
			"/file3.txt",
			createMockNode("uuid-3", "file3", "p"),
		);

		expect(cache.size).toBe(3);

		// Access file1 and file2 to update their LRU timestamps
		cache.get("tenant1", "user@example.com", "/file1.txt");
		cache.get("tenant1", "user@example.com", "/file2.txt");

		// Add file4 - should evict file3 (least recently used)
		cache.set(
			"tenant1",
			"user@example.com",
			"/file4.txt",
			createMockNode("uuid-4", "file4", "p"),
		);

		expect(cache.size).toBe(3);
		expect(cache.get("tenant1", "user@example.com", "/file1.txt")).toBeDefined(); // Still there
		expect(cache.get("tenant1", "user@example.com", "/file2.txt")).toBeDefined(); // Still there
		expect(cache.get("tenant1", "user@example.com", "/file3.txt")).toBeUndefined(); // Evicted
		expect(cache.get("tenant1", "user@example.com", "/file4.txt")).toBeDefined(); // New entry

		const stats = cache.getStats();
		expect(stats.evictions).toBe(1);
	});

	it("invalidate specific path", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100 });

		cache.set(
			"tenant1",
			"user@example.com",
			"/folder/file.txt",
			createMockNode("uuid-1", "file", "p"),
		);
		cache.set(
			"tenant1",
			"user@example.com",
			"/folder/other.txt",
			createMockNode("uuid-2", "other", "p"),
		);

		expect(cache.size).toBe(2);

		// Invalidate one path
		cache.invalidatePath("tenant1", "/folder/file.txt");

		expect(cache.size).toBe(1);
		expect(cache.get("tenant1", "user@example.com", "/folder/file.txt")).toBeUndefined();
		expect(cache.get("tenant1", "user@example.com", "/folder/other.txt")).toBeDefined();

		const stats = cache.getStats();
		expect(stats.invalidations).toBe(1);
	});

	it("invalidate prefix (folder and children)", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100 });

		cache.set(
			"tenant1",
			"user@example.com",
			"/folder",
			createMockNode("uuid-1", "folder", "root"),
		);
		cache.set(
			"tenant1",
			"user@example.com",
			"/folder/file1.txt",
			createMockNode("uuid-2", "file1", "1"),
		);
		cache.set(
			"tenant1",
			"user@example.com",
			"/folder/file2.txt",
			createMockNode("uuid-3", "file2", "1"),
		);
		cache.set(
			"tenant1",
			"user@example.com",
			"/folder/subfolder/file3.txt",
			createMockNode("uuid-4", "file3", "sub"),
		);
		cache.set(
			"tenant1",
			"user@example.com",
			"/other/file.txt",
			createMockNode("uuid-5", "other", "o"),
		);

		expect(cache.size).toBe(5);

		// Invalidate /folder and all children
		cache.invalidatePrefix("tenant1", "/folder");

		expect(cache.size).toBe(1); // Only /other/file.txt remains
		expect(cache.get("tenant1", "user@example.com", "/other/file.txt")).toBeDefined();
		expect(cache.get("tenant1", "user@example.com", "/folder")).toBeUndefined();
		expect(cache.get("tenant1", "user@example.com", "/folder/file1.txt")).toBeUndefined();
		expect(cache.get("tenant1", "user@example.com", "/folder/subfolder/file3.txt"))
			.toBeUndefined();

		const stats = cache.getStats();
		expect(stats.invalidations).toBe(4);
	});

	it("invalidate by UUID", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100 });

		// Same node cached under multiple paths (e.g., after rename)
		const node = createMockNode("uuid-123", "file.txt", "parent-1");
		cache.set("tenant1", "user@example.com", "/folder/old-name.txt", node);
		cache.set("tenant1", "user@example.com", "/folder/new-name.txt", node);

		expect(cache.size).toBe(2);

		// Invalidate by UUID - should remove both entries
		cache.invalidateByUUID("tenant1", "uuid-123");

		expect(cache.size).toBe(0);
		expect(cache.get("tenant1", "user@example.com", "/folder/old-name.txt")).toBeUndefined();
		expect(cache.get("tenant1", "user@example.com", "/folder/new-name.txt")).toBeUndefined();
	});

	it("invalidate entire tenant", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100 });

		cache.set(
			"tenant1",
			"user@example.com",
			"/file1.txt",
			createMockNode("uuid-1", "file1", "p"),
		);
		cache.set(
			"tenant1",
			"user@example.com",
			"/file2.txt",
			createMockNode("uuid-2", "file2", "p"),
		);
		cache.set(
			"tenant2",
			"user@example.com",
			"/file3.txt",
			createMockNode("uuid-3", "file3", "p"),
		);

		expect(cache.size).toBe(3);

		// Invalidate tenant1
		cache.invalidateTenant("tenant1");

		expect(cache.size).toBe(1); // Only tenant2 remains
		expect(cache.get("tenant2", "user@example.com", "/file3.txt")).toBeDefined();
		expect(cache.get("tenant1", "user@example.com", "/file1.txt")).toBeUndefined();
	});

	it("clear all", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100 });

		cache.set(
			"tenant1",
			"user@example.com",
			"/file1.txt",
			createMockNode("uuid-1", "file1", "p"),
		);
		cache.set(
			"tenant2",
			"user@example.com",
			"/file2.txt",
			createMockNode("uuid-2", "file2", "p"),
		);

		expect(cache.size).toBe(2);

		cache.clear();

		expect(cache.size).toBe(0);
		expect(cache.get("tenant1", "user@example.com", "/file1.txt")).toBeUndefined();
		expect(cache.get("tenant2", "user@example.com", "/file2.txt")).toBeUndefined();
	});

	it("evict expired entries", async () => {
		const cache = new WebDAVPathCache({ maxEntries: 100, ttlMs: 50 });

		cache.set(
			"tenant1",
			"user@example.com",
			"/file1.txt",
			createMockNode("uuid-1", "file1", "p"),
		);
		cache.set(
			"tenant1",
			"user@example.com",
			"/file2.txt",
			createMockNode("uuid-2", "file2", "p"),
		);

		expect(cache.size).toBe(2);

		// Wait for expiration
		await new Promise((resolve) => setTimeout(resolve, 60));

		// Manually trigger cleanup
		const evicted = cache.evictExpired();

		expect(evicted).toBe(2);
		expect(cache.size).toBe(0);
	});

	it("statistics", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100 });

		cache.set(
			"tenant1",
			"user@example.com",
			"/file.txt",
			createMockNode("uuid-1", "file", "p"),
		);

		cache.get("tenant1", "user@example.com", "/file.txt"); // Hit
		cache.get("tenant1", "user@example.com", "/file.txt"); // Hit
		cache.get("tenant1", "user@example.com", "/missing.txt"); // Miss

		cache.invalidatePath("tenant1", "/file.txt");

		const stats = cache.getStats();

		expect(stats.hits).toBe(2);
		expect(stats.misses).toBe(1);
		expect(stats.invalidations).toBe(1);
		expect(stats.evictions).toBe(0);
		expect(stats.hitRate).toBe(2 / 3); // 2 hits out of 3 total accesses

		// Reset stats
		cache.resetStats();
		const resetStats = cache.getStats();
		expect(resetStats.hits).toBe(0);
		expect(resetStats.misses).toBe(0);
	});

	it("concurrent access", () => {
		const cache = new WebDAVPathCache({ maxEntries: 1000 });

		// Simulate concurrent writes
		for (let i = 0; i < 100; i++) {
			cache.set(
				"tenant1",
				`user${i}@example.com`,
				`/file${i}.txt`,
				createMockNode(`uuid-${i}`, `file${i}`, "parent"),
			);
		}

		expect(cache.size).toBe(100);

		// Simulate concurrent reads
		let hits = 0;
		for (let i = 0; i < 100; i++) {
			const node = cache.get("tenant1", `user${i}@example.com`, `/file${i}.txt`);
			if (node) hits++;
		}

		expect(hits).toBe(100);
	});

	it("path normalization edge cases", () => {
		const cache = new WebDAVPathCache({ maxEntries: 100 });
		const node = createMockNode("uuid-1", "file.txt", "parent-1");

		// Store with trailing slash
		cache.set("tenant1", "user@example.com", "/folder/", node);

		// Retrieve without trailing slash should still work (if normalized)
		// Note: Current implementation doesn't normalize, so these are different keys
		const result1 = cache.get("tenant1", "user@example.com", "/folder/");
		const result2 = cache.get("tenant1", "user@example.com", "/folder");

		expect(result1).toBeDefined();
		expect(result2).toBeUndefined(); // Different key

		// This shows normalization could be added if needed
	});
});
