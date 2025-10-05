import { describe, it } from "bdd";
import { expect } from "expect";

import buildFlatFileVectorDatabase from "./flat_file_vector_database.ts";
import type {
	VectorDatabase,
	VectorEntry,
} from "application/ai/vector_database.ts";

async function createDb(baseDir: string): Promise<VectorDatabase> {
	const maybeDb = await buildFlatFileVectorDatabase(baseDir);
	expect(maybeDb.isRight()).toBe(true);
	return maybeDb.isRight() ? maybeDb.value : (undefined as never);
}

describe("FlatFileVectorDatabase", () => {
	it("should persist vectors to disk across instances", async () => {
		const baseDir = await Deno.makeTempDir();

		try {
			const db = await createDb(baseDir);
			const entry: VectorEntry = {
				id: "persist-1",
				vector: [1, 0, 0],
				metadata: {
					nodeUuid: "node-a",
					tenant: "tenant-a",
					mimetype: "text/plain",
					title: "Persistent Doc",
					model: "model-x",
				},
			};

			const upsertResult = await db.upsert(entry);
			expect(upsertResult.isRight()).toBe(true);

			const reloadedDb = await createDb(baseDir);
			const searchResult = await reloadedDb.search(
				entry.vector,
				entry.metadata.tenant,
				1,
			);

			expect(searchResult.isRight()).toBe(true);
			if (searchResult.isRight()) {
				expect(searchResult.value.length).toBe(1);
				expect(searchResult.value[0].id).toBe(entry.id);
			}
		} finally {
			await Deno.remove(baseDir, { recursive: true });
		}
	});

	it("should support batch upserts and metadata filtering", async () => {
		const baseDir = await Deno.makeTempDir();

		try {
			const db = await createDb(baseDir);
			const entries: VectorEntry[] = [
				{
					id: "batch-1",
					vector: [0.9, 0.1, 0],
					metadata: {
						nodeUuid: "node-1",
						tenant: "tenant-a",
						mimetype: "text/plain",
						title: "Plain Text",
						model: "model-x",
					},
				},
				{
					id: "batch-2",
					vector: [0.1, 0.9, 0],
					metadata: {
						nodeUuid: "node-2",
						tenant: "tenant-a",
						mimetype: "application/pdf",
						title: "PDF Doc",
						model: "model-x",
					},
				},
			];

			const batchResult = await db.upsertBatch(entries);
			expect(batchResult.isRight()).toBe(true);

			const searchResult = await db.search([1, 0, 0], "tenant-a", 5, {
				mimetype: "text/plain",
			});

			expect(searchResult.isRight()).toBe(true);
			if (searchResult.isRight()) {
				expect(searchResult.value.length).toBe(1);
				expect(searchResult.value[0].id).toBe("batch-1");
			}
		} finally {
			await Deno.remove(baseDir, { recursive: true });
		}
	});

	it("should delete vectors by id and node uuid", async () => {
		const baseDir = await Deno.makeTempDir();

		try {
			const db = await createDb(baseDir);
			const entries: VectorEntry[] = [
				{
					id: "delete-1",
					vector: [1, 0, 0],
					metadata: {
						nodeUuid: "node-1",
						tenant: "tenant-a",
						mimetype: "text/plain",
						title: "Doc 1",
						model: "model-x",
					},
				},
				{
					id: "delete-2",
					vector: [0, 1, 0],
					metadata: {
						nodeUuid: "node-2",
						tenant: "tenant-a",
						mimetype: "text/plain",
						title: "Doc 2",
						model: "model-x",
					},
				},
				{
					id: "delete-3",
					vector: [0, 0, 1],
					metadata: {
						nodeUuid: "node-2",
						tenant: "tenant-a",
						mimetype: "text/plain",
						title: "Doc 3",
						model: "model-x",
					},
				},
			];

			await db.upsertBatch(entries);

			const deleteResult = await db.delete("delete-1");
			expect(deleteResult.isRight()).toBe(true);

			const reloadedDb = await createDb(baseDir);
			const searchAll = await reloadedDb.search([1, 0, 0], "tenant-a", 10);
			expect(searchAll.isRight()).toBe(true);
			if (searchAll.isRight()) {
				expect(searchAll.value.find((entry) => entry.id === "delete-1")).toBeUndefined();
			}

			const deleteByNodeResult = await reloadedDb.deleteByNodeUuid("node-2");
			expect(deleteByNodeResult.isRight()).toBe(true);

			const finalDb = await createDb(baseDir);
			const finalSearch = await finalDb.search([1, 0, 0], "tenant-a", 10);
			expect(finalSearch.isRight()).toBe(true);
			if (finalSearch.isRight()) {
				expect(finalSearch.value.length).toBe(0);
			}
		} finally {
			await Deno.remove(baseDir, { recursive: true });
		}
	});
});
