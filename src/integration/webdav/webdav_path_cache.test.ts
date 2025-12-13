/**
 * WebDAV Path Cache Tests
 *
 * Demonstrates comprehensive testing of the path cache implementation.
 */

import { assertEquals, assertExists } from "@std/assert";
import { WebDAVPathCache } from "./webdav_path_cache.ts";
import { Node } from "domain/nodes/node.ts";
import { Users } from "domain/users_groups/users.ts";

// Mock node factory
function createMockNode(uuid: string, title: string, parent: string): Node {
	return new Node({
		uuid,
		title,
		parent,
		mimetype: "text/plain",
		owner: Users.ROOT_USER_EMAIL,
	});
}

Deno.test("WebDAVPathCache - Basic get/set", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100, ttlMs: 60000 });
	const node = createMockNode("uuid-1", "file.txt", "parent-1");

	// Cache miss
	const miss = cache.get("tenant1", "user@example.com", "/folder/file.txt");
	assertEquals(miss, undefined);

	// Store in cache
	cache.set("tenant1", "user@example.com", "/folder/file.txt", node);

	// Cache hit
	const hit = cache.get("tenant1", "user@example.com", "/folder/file.txt");
	assertExists(hit);
	assertEquals(hit?.uuid, "uuid-1");

	// Stats should show 1 hit and 1 miss
	const stats = cache.getStats();
	assertEquals(stats.hits, 1);
	assertEquals(stats.misses, 1);
	assertEquals(stats.size, 1);
	assertEquals(stats.hitRate, 0.5); // 1 hit out of 2 total accesses
});

Deno.test("WebDAVPathCache - Tenant isolation", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100 });
	const node1 = createMockNode("uuid-1", "file.txt", "parent-1");
	const node2 = createMockNode("uuid-2", "file.txt", "parent-2");

	// Same path, different tenants
	cache.set("tenant1", "user@example.com", "/file.txt", node1);
	cache.set("tenant2", "user@example.com", "/file.txt", node2);

	const result1 = cache.get("tenant1", "user@example.com", "/file.txt");
	const result2 = cache.get("tenant2", "user@example.com", "/file.txt");

	assertEquals(result1?.uuid, "uuid-1");
	assertEquals(result2?.uuid, "uuid-2");
	assertEquals(cache.size, 2);
});

Deno.test("WebDAVPathCache - User isolation enabled", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100, userIsolation: true });
	const node1 = createMockNode("uuid-1", "file.txt", "parent-1");
	const node2 = createMockNode("uuid-2", "file.txt", "parent-2");

	// Same path and tenant, different users
	cache.set("tenant1", "user1@example.com", "/file.txt", node1);
	cache.set("tenant1", "user2@example.com", "/file.txt", node2);

	const result1 = cache.get("tenant1", "user1@example.com", "/file.txt");
	const result2 = cache.get("tenant1", "user2@example.com", "/file.txt");

	assertEquals(result1?.uuid, "uuid-1");
	assertEquals(result2?.uuid, "uuid-2");
	assertEquals(cache.size, 2);
});

Deno.test("WebDAVPathCache - User isolation disabled (shared cache)", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100, userIsolation: false });
	const node1 = createMockNode("uuid-1", "file.txt", "parent-1");

	// Same path and tenant, different users - should share cache entry
	cache.set("tenant1", "user1@example.com", "/file.txt", node1);

	const result2 = cache.get("tenant1", "user2@example.com", "/file.txt");
	assertEquals(result2?.uuid, "uuid-1"); // Gets same node
	assertEquals(cache.size, 1); // Only one entry
});

Deno.test("WebDAVPathCache - TTL expiration", async () => {
	const cache = new WebDAVPathCache({ maxEntries: 100, ttlMs: 50 }); // 50ms TTL
	const node = createMockNode("uuid-1", "file.txt", "parent-1");

	cache.set("tenant1", "user@example.com", "/file.txt", node);

	// Immediate access - should hit
	const hit = cache.get("tenant1", "user@example.com", "/file.txt");
	assertExists(hit);

	// Wait for TTL to expire
	await new Promise((resolve) => setTimeout(resolve, 60));

	// Access after expiration - should miss
	const miss = cache.get("tenant1", "user@example.com", "/file.txt");
	assertEquals(miss, undefined);
	assertEquals(cache.size, 0); // Entry auto-removed
});

Deno.test("WebDAVPathCache - LRU eviction", () => {
	const cache = new WebDAVPathCache({ maxEntries: 3, ttlMs: 60000 });

	// Fill cache to capacity
	cache.set("tenant1", "user@example.com", "/file1.txt", createMockNode("1", "file1", "p"));
	cache.set("tenant1", "user@example.com", "/file2.txt", createMockNode("2", "file2", "p"));
	cache.set("tenant1", "user@example.com", "/file3.txt", createMockNode("3", "file3", "p"));

	assertEquals(cache.size, 3);

	// Access file1 and file2 to update their LRU timestamps
	cache.get("tenant1", "user@example.com", "/file1.txt");
	cache.get("tenant1", "user@example.com", "/file2.txt");

	// Add file4 - should evict file3 (least recently used)
	cache.set("tenant1", "user@example.com", "/file4.txt", createMockNode("4", "file4", "p"));

	assertEquals(cache.size, 3);
	assertExists(cache.get("tenant1", "user@example.com", "/file1.txt")); // Still there
	assertExists(cache.get("tenant1", "user@example.com", "/file2.txt")); // Still there
	assertEquals(cache.get("tenant1", "user@example.com", "/file3.txt"), undefined); // Evicted
	assertExists(cache.get("tenant1", "user@example.com", "/file4.txt")); // New entry

	const stats = cache.getStats();
	assertEquals(stats.evictions, 1);
});

Deno.test("WebDAVPathCache - Invalidate specific path", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100 });

	cache.set("tenant1", "user@example.com", "/folder/file.txt", createMockNode("1", "file", "p"));
	cache.set("tenant1", "user@example.com", "/folder/other.txt", createMockNode("2", "other", "p"));

	assertEquals(cache.size, 2);

	// Invalidate one path
	cache.invalidatePath("tenant1", "/folder/file.txt");

	assertEquals(cache.size, 1);
	assertEquals(cache.get("tenant1", "user@example.com", "/folder/file.txt"), undefined);
	assertExists(cache.get("tenant1", "user@example.com", "/folder/other.txt"));

	const stats = cache.getStats();
	assertEquals(stats.invalidations, 1);
});

Deno.test("WebDAVPathCache - Invalidate prefix (folder and children)", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100 });

	cache.set("tenant1", "user@example.com", "/folder", createMockNode("1", "folder", "root"));
	cache.set(
		"tenant1",
		"user@example.com",
		"/folder/file1.txt",
		createMockNode("2", "file1", "1"),
	);
	cache.set(
		"tenant1",
		"user@example.com",
		"/folder/file2.txt",
		createMockNode("3", "file2", "1"),
	);
	cache.set(
		"tenant1",
		"user@example.com",
		"/folder/subfolder/file3.txt",
		createMockNode("4", "file3", "sub"),
	);
	cache.set("tenant1", "user@example.com", "/other/file.txt", createMockNode("5", "other", "o"));

	assertEquals(cache.size, 5);

	// Invalidate /folder and all children
	cache.invalidatePrefix("tenant1", "/folder");

	assertEquals(cache.size, 1); // Only /other/file.txt remains
	assertExists(cache.get("tenant1", "user@example.com", "/other/file.txt"));
	assertEquals(cache.get("tenant1", "user@example.com", "/folder"), undefined);
	assertEquals(cache.get("tenant1", "user@example.com", "/folder/file1.txt"), undefined);
	assertEquals(cache.get("tenant1", "user@example.com", "/folder/subfolder/file3.txt"), undefined);

	const stats = cache.getStats();
	assertEquals(stats.invalidations, 4);
});

Deno.test("WebDAVPathCache - Invalidate by UUID", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100 });

	// Same node cached under multiple paths (e.g., after rename)
	const node = createMockNode("uuid-123", "file.txt", "parent-1");
	cache.set("tenant1", "user@example.com", "/folder/old-name.txt", node);
	cache.set("tenant1", "user@example.com", "/folder/new-name.txt", node);

	assertEquals(cache.size, 2);

	// Invalidate by UUID - should remove both entries
	cache.invalidateByUUID("tenant1", "uuid-123");

	assertEquals(cache.size, 0);
	assertEquals(cache.get("tenant1", "user@example.com", "/folder/old-name.txt"), undefined);
	assertEquals(cache.get("tenant1", "user@example.com", "/folder/new-name.txt"), undefined);
});

Deno.test("WebDAVPathCache - Invalidate entire tenant", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100 });

	cache.set("tenant1", "user@example.com", "/file1.txt", createMockNode("1", "file1", "p"));
	cache.set("tenant1", "user@example.com", "/file2.txt", createMockNode("2", "file2", "p"));
	cache.set("tenant2", "user@example.com", "/file3.txt", createMockNode("3", "file3", "p"));

	assertEquals(cache.size, 3);

	// Invalidate tenant1
	cache.invalidateTenant("tenant1");

	assertEquals(cache.size, 1); // Only tenant2 remains
	assertExists(cache.get("tenant2", "user@example.com", "/file3.txt"));
	assertEquals(cache.get("tenant1", "user@example.com", "/file1.txt"), undefined);
});

Deno.test("WebDAVPathCache - Clear all", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100 });

	cache.set("tenant1", "user@example.com", "/file1.txt", createMockNode("1", "file1", "p"));
	cache.set("tenant2", "user@example.com", "/file2.txt", createMockNode("2", "file2", "p"));

	assertEquals(cache.size, 2);

	cache.clear();

	assertEquals(cache.size, 0);
	assertEquals(cache.get("tenant1", "user@example.com", "/file1.txt"), undefined);
	assertEquals(cache.get("tenant2", "user@example.com", "/file2.txt"), undefined);
});

Deno.test("WebDAVPathCache - Evict expired entries", async () => {
	const cache = new WebDAVPathCache({ maxEntries: 100, ttlMs: 50 });

	cache.set("tenant1", "user@example.com", "/file1.txt", createMockNode("1", "file1", "p"));
	cache.set("tenant1", "user@example.com", "/file2.txt", createMockNode("2", "file2", "p"));

	assertEquals(cache.size, 2);

	// Wait for expiration
	await new Promise((resolve) => setTimeout(resolve, 60));

	// Manually trigger cleanup
	const evicted = cache.evictExpired();

	assertEquals(evicted, 2);
	assertEquals(cache.size, 0);
});

Deno.test("WebDAVPathCache - Statistics", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100 });

	cache.set("tenant1", "user@example.com", "/file.txt", createMockNode("1", "file", "p"));

	cache.get("tenant1", "user@example.com", "/file.txt"); // Hit
	cache.get("tenant1", "user@example.com", "/file.txt"); // Hit
	cache.get("tenant1", "user@example.com", "/missing.txt"); // Miss

	cache.invalidatePath("tenant1", "/file.txt");

	const stats = cache.getStats();

	assertEquals(stats.hits, 2);
	assertEquals(stats.misses, 1);
	assertEquals(stats.invalidations, 1);
	assertEquals(stats.evictions, 0);
	assertEquals(stats.hitRate, 2 / 3); // 2 hits out of 3 total accesses

	// Reset stats
	cache.resetStats();
	const resetStats = cache.getStats();
	assertEquals(resetStats.hits, 0);
	assertEquals(resetStats.misses, 0);
});

Deno.test("WebDAVPathCache - Concurrent access", () => {
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

	assertEquals(cache.size, 100);

	// Simulate concurrent reads
	let hits = 0;
	for (let i = 0; i < 100; i++) {
		const node = cache.get("tenant1", `user${i}@example.com`, `/file${i}.txt`);
		if (node) hits++;
	}

	assertEquals(hits, 100);
});

Deno.test("WebDAVPathCache - Path normalization edge cases", () => {
	const cache = new WebDAVPathCache({ maxEntries: 100 });
	const node = createMockNode("uuid-1", "file.txt", "parent-1");

	// Store with trailing slash
	cache.set("tenant1", "user@example.com", "/folder/", node);

	// Retrieve without trailing slash should still work (if normalized)
	// Note: Current implementation doesn't normalize, so these are different keys
	const result1 = cache.get("tenant1", "user@example.com", "/folder/");
	const result2 = cache.get("tenant1", "user@example.com", "/folder");

	assertExists(result1);
	assertEquals(result2, undefined); // Different key

	// This shows normalization could be added if needed
});
