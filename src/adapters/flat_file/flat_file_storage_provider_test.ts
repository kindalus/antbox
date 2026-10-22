import { expect } from "expect";
import { stub } from "mock";
import buildFlatFileStorageProvider from "./flat_file_storage_provider.ts";

Deno.test("flat-file storage preserves existing content after partial write or rename failure", async () => {
	const directory = await Deno.makeTempDir();
	try {
		const storage = (await buildFlatFileStorageProvider(directory)).right;
		const original = new File(["original content"], "original.txt", { type: "text/plain" });
		expect((await storage.write("test_file", original)).isRight()).toBe(true);
		const partialWrite = stub(Deno, "writeFile", async (path) => {
			Deno.writeTextFileSync(path, "partial");
			throw new Deno.errors.WriteZero("test interrupted write");
		});
		try {
			expect((await storage.write("test_file", new File(["replacement"], "new.txt"))).isLeft())
				.toBe(true);
		} finally {
			partialWrite.restore();
		}
		expect(await (await storage.read("test_file")).right.text()).toBe("original content");
		const rename = stub(Deno, "rename", () => {
			throw new Deno.errors.PermissionDenied("test rename failure");
		});
		try {
			expect((await storage.write("test_file", new File(["replacement"], "new.txt"))).isLeft())
				.toBe(true);
		} finally {
			rename.restore();
		}
		expect(await (await storage.read("test_file")).right.text()).toBe("original content");
		expect([...Deno.readDirSync(`${directory}/T/E`)].map((entry) => entry.name).sort()).toEqual([
			"test_file",
			"test_file.mimetype",
		]);
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
});

Deno.test("flat-file storage reports a MIME sidecar failure after committing content", async () => {
	const directory = await Deno.makeTempDir();
	try {
		const storage = (await buildFlatFileStorageProvider(directory)).right;
		await storage.write("test_file", new File(["original"], "old.txt", { type: "text/plain" }));
		const mimeWrite = stub(Deno, "writeTextFile", () => {
			throw new Deno.errors.PermissionDenied("test MIME write failure");
		});
		try {
			expect((await storage.write(
				"test_file",
				new File(["replacement"], "new.html", {
					type: "text/html",
				}),
			)).isLeft()).toBe(true);
		} finally {
			mimeWrite.restore();
		}
		const stored = (await storage.read("test_file")).right;
		expect(await stored.text()).toBe("replacement");
		expect(stored.type).toBe("text/plain");
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
});
