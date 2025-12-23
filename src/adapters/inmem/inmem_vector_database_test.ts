import { describe, it } from "bdd";
import { expect } from "expect";
import { InMemoryVectorDatabase } from "./inmem_vector_database.ts";
import type { VectorEntry } from "application/vector_database.ts";

describe("InMemoryVectorDatabase", () => {
	describe("upsert", () => {
		it("should upsert a vector entry", async () => {
			const db = new InMemoryVectorDatabase();
			const entry: VectorEntry = {
				id: "test-1",
				vector: [0.1, 0.2, 0.3],
				metadata: {
					nodeUuid: "node-1",
					tenant: "tenant-1",
					mimetype: "text/plain",
					title: "Test Document",
					model: "text-embedding-3-small",
				},
			};

			const result = await db.upsert(entry);
			expect(result.isRight()).toBe(true);
			expect(db.size()).toBe(1);
		});

		it("should update existing entry on upsert", async () => {
			const db = new InMemoryVectorDatabase();
			const entry1: VectorEntry = {
				id: "test-1",
				vector: [0.1, 0.2, 0.3],
				metadata: {
					nodeUuid: "node-1",
					tenant: "tenant-1",
					mimetype: "text/plain",
					title: "First Title",
					model: "text-embedding-3-small",
				},
			};

			await db.upsert(entry1);

			const entry2: VectorEntry = {
				id: "test-1",
				vector: [0.4, 0.5, 0.6],
				metadata: {
					nodeUuid: "node-1",
					tenant: "tenant-1",
					mimetype: "text/plain",
					title: "Updated Title",
					model: "text-embedding-3-small",
				},
			};

			await db.upsert(entry2);
			expect(db.size()).toBe(1); // Should still be 1, not 2
		});
	});

	describe("batch upsert", () => {
		it("should batch upsert multiple entries", async () => {
			const db = new InMemoryVectorDatabase();
			const entries: VectorEntry[] = [
				{
					id: "test-1",
					vector: [0.1, 0.2, 0.3],
					metadata: {
						nodeUuid: "node-1",
						tenant: "tenant-1",
						mimetype: "text/plain",
						title: "Doc 1",
						model: "text-embedding-3-small",
					},
				},
				{
					id: "test-2",
					vector: [0.4, 0.5, 0.6],
					metadata: {
						nodeUuid: "node-2",
						tenant: "tenant-1",
						mimetype: "text/plain",
						title: "Doc 2",
						model: "text-embedding-3-small",
					},
				},
			];

			const result = await db.upsertBatch(entries);
			expect(result.isRight()).toBe(true);
			expect(db.size()).toBe(2);
		});
	});

	describe("search", () => {
		it("should search and return results by similarity", async () => {
			const db = new InMemoryVectorDatabase();

			// Insert test vectors
			await db.upsert({
				id: "test-1",
				vector: [1.0, 0.0, 0.0], // Very similar to query
				metadata: {
					nodeUuid: "node-1",
					tenant: "tenant-1",
					mimetype: "text/plain",
					title: "Similar Doc",
					model: "text-embedding-3-small",
				},
			});

			await db.upsert({
				id: "test-2",
				vector: [0.0, 1.0, 0.0], // Orthogonal to query
				metadata: {
					nodeUuid: "node-2",
					tenant: "tenant-1",
					mimetype: "text/plain",
					title: "Different Doc",
					model: "text-embedding-3-small",
				},
			});

			// Query with vector similar to test-1
			const queryVector = [0.9, 0.1, 0.0];
			const result = await db.search(queryVector, 2);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(2);
				// First result should be more similar
				expect(result.value[0].id).toBe("test-1");
				expect(result.value[0].score).toBeGreaterThan(result.value[1].score);
			}
		});

		it("should filter search results by tenant", async () => {
			const db = new InMemoryVectorDatabase();

			await db.upsert({
				id: "test-1",
				vector: [1.0, 0.0, 0.0],
				metadata: {
					nodeUuid: "node-1",
					tenant: "tenant-1",
					mimetype: "text/plain",
					title: "Tenant 1 Doc",
					model: "text-embedding-3-small",
				},
			});

			await db.upsert({
				id: "test-2",
				vector: [1.0, 0.0, 0.0],
				metadata: {
					nodeUuid: "node-2",
					tenant: "tenant-2",
					mimetype: "text/plain",
					title: "Tenant 2 Doc",
					model: "text-embedding-3-small",
				},
			});

			const queryVector = [1.0, 0.0, 0.0];
			const result = await db.search(queryVector, 10);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Filter by tenant in the test since API no longer supports tenant filtering
				const tenant1Results = result.value.filter((r) => r.metadata.tenant === "tenant-1");
				expect(tenant1Results.length).toBe(1);
				expect(tenant1Results[0].metadata.tenant).toBe("tenant-1");
			}
		});

		it("should filter search results by metadata", async () => {
			const db = new InMemoryVectorDatabase();

			await db.upsert({
				id: "test-1",
				vector: [1.0, 0.0, 0.0],
				metadata: {
					nodeUuid: "node-1",
					tenant: "tenant-1",
					mimetype: "text/plain",
					title: "Plain Text",
					model: "text-embedding-3-small",
				},
			});

			await db.upsert({
				id: "test-2",
				vector: [1.0, 0.0, 0.0],
				metadata: {
					nodeUuid: "node-2",
					tenant: "tenant-1",
					mimetype: "application/pdf",
					title: "PDF Doc",
					model: "text-embedding-3-small",
				},
			});

			const queryVector = [1.0, 0.0, 0.0];
			const result = await db.search(queryVector, 10);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Filter by mimetype in the test since API no longer supports metadata filtering
				const plainTextResults = result.value.filter((r) =>
					r.metadata.mimetype === "text/plain"
				);
				expect(plainTextResults.length).toBe(1);
				expect(plainTextResults[0].metadata.mimetype).toBe("text/plain");
			}
		});

		it("should return top K results", async () => {
			const db = new InMemoryVectorDatabase();

			// Insert 5 entries
			for (let i = 0; i < 5; i++) {
				await db.upsert({
					id: `test-${i}`,
					vector: [Math.random(), Math.random(), Math.random()],
					metadata: {
						nodeUuid: `node-${i}`,
						tenant: "tenant-1",
						mimetype: "text/plain",
						title: `Doc ${i}`,
						model: "text-embedding-3-small",
					},
				});
			}

			const queryVector = [0.5, 0.5, 0.5];
			const result = await db.search(queryVector, 3);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				expect(result.value.length).toBe(3); // Should return exactly 3 results
			}
		});
	});

	describe("delete", () => {
		it("should delete entry by id", async () => {
			const db = new InMemoryVectorDatabase();

			await db.upsert({
				id: "test-1",
				vector: [1.0, 0.0, 0.0],
				metadata: {
					nodeUuid: "node-1",
					tenant: "tenant-1",
					mimetype: "text/plain",
					title: "Doc",
					model: "text-embedding-3-small",
				},
			});

			expect(db.size()).toBe(1);

			const result = await db.delete("test-1");
			expect(result.isRight()).toBe(true);
			expect(db.size()).toBe(0);
		});

		it("should delete entries by node UUID", async () => {
			const db = new InMemoryVectorDatabase();

			await db.upsertBatch([
				{
					id: "test-1",
					vector: [1.0, 0.0, 0.0],
					metadata: {
						nodeUuid: "node-1",
						tenant: "tenant-1",
						mimetype: "text/plain",
						title: "Doc 1",
						model: "text-embedding-3-small",
					},
				},
				{
					id: "test-2",
					vector: [0.0, 1.0, 0.0],
					metadata: {
						nodeUuid: "node-1", // Same node
						tenant: "tenant-1",
						mimetype: "text/plain",
						title: "Doc 1 v2",
						model: "text-embedding-3-small",
					},
				},
				{
					id: "test-3",
					vector: [0.0, 0.0, 1.0],
					metadata: {
						nodeUuid: "node-2", // Different node
						tenant: "tenant-1",
						mimetype: "text/plain",
						title: "Doc 2",
						model: "text-embedding-3-small",
					},
				},
			]);

			expect(db.size()).toBe(3);

			const result = await db.deleteByNodeUuid("node-1");
			expect(result.isRight()).toBe(true);
			expect(db.size()).toBe(1); // Only node-2 should remain
		});
	});
});
