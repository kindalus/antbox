import { describe, it } from "bdd";
import { expect } from "expect";
import buildFlatFileStorageProvider from "./flat_file_storage_provider.ts";
import { type StorageProvider } from "application/storage_provider.ts";

async function createStorage(baseDir: string): Promise<StorageProvider> {
	const maybeStorage = await buildFlatFileStorageProvider(baseDir);
	expect(maybeStorage.isRight()).toBe(true);
	return maybeStorage.isRight() ? maybeStorage.value : (undefined as never);
}

describe("FlatFileStorageProvider", () => {
	it("should persist mimetype across instances", async () => {
		const baseDir = await Deno.makeTempDir();
		try {
			const storage = await createStorage(baseDir);
			const uuid = "test-uuid-1";
			const fileContent = new Uint8Array([1, 2, 3]);
			const file = new File([fileContent], "test.png", { type: "image/png" });

			const writeResult = await storage.write(uuid, file);
			expect(writeResult.isRight()).toBe(true);

			// Re-create storage to simulate restart
			const newStorage = await createStorage(baseDir);
			const readResult = await newStorage.read(uuid);

			expect(readResult.isRight()).toBe(true);
			if (readResult.isRight()) {
				expect(readResult.value.type).toBe("image/png");
				expect(readResult.value.size).toBe(3);
			}
		} finally {
			await Deno.remove(baseDir, { recursive: true });
		}
	});

	it("should handle files with different mimetypes independently", async () => {
		const baseDir = await Deno.makeTempDir();
		try {
			const storage = await createStorage(baseDir);
			const uuid1 = "test-uuid-1";
			const file1 = new File([new Uint8Array([1])], "test.png", {
				type: "image/png",
			});

			const uuid2 = "test-uuid-2";
			const file2 = new File([new Uint8Array([2])], "test.pdf", {
				type: "application/pdf",
			});

			await storage.write(uuid1, file1);
			await storage.write(uuid2, file2);

			const readResult1 = await storage.read(uuid1);
			const readResult2 = await storage.read(uuid2);

			expect(readResult1.isRight()).toBe(true);
			if (readResult1.isRight()) {
				expect(readResult1.value.type).toBe("image/png");
			}

			expect(readResult2.isRight()).toBe(true);
			if (readResult2.isRight()) {
				expect(readResult2.value.type).toBe("application/pdf");
			}
		} finally {
			await Deno.remove(baseDir, { recursive: true });
		}
	});
});
