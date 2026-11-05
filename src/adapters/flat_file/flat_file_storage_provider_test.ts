import { fileMimetype } from "shared/mimetype.ts";
import { it } from "bdd";
import { expect } from "expect";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stub } from "shared/testing/stub.ts";
import buildFlatFileStorageProvider from "./flat_file_storage_provider.ts";

const realWriteFile = fs.writeFile.bind(fs);

it("flat-file storage preserves existing content after partial write or rename failure", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		const storage = (await buildFlatFileStorageProvider(directory)).right;
		const original = new File(["original content"], "original.txt", { type: "text/plain" });
		expect((await storage.write("test_file", original)).isRight()).toBe(true);
		const partialWrite = stub(fs, "writeFile", async (path) => {
			await realWriteFile(path, "partial");
			throw Object.assign(new Error("test interrupted write"), { code: "EIO" });
		});
		try {
			expect((await storage.write("test_file", new File(["replacement"], "new.txt"))).isLeft())
				.toBe(true);
		} finally {
			partialWrite.restore();
		}
		expect(await (await storage.read("test_file")).right.text()).toBe("original content");
		const rename = stub(fs, "rename", () => {
			throw Object.assign(new Error("test rename failure"), { code: "EACCES" });
		});
		try {
			expect((await storage.write("test_file", new File(["replacement"], "new.txt"))).isLeft())
				.toBe(true);
		} finally {
			rename.restore();
		}
		expect(await (await storage.read("test_file")).right.text()).toBe("original content");
		expect((await fs.readdir(`${directory}/T/E`)).sort()).toEqual([
			"test_file",
			"test_file.mimetype",
		]);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

it("flat-file storage reports a MIME sidecar failure after committing content", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		const storage = (await buildFlatFileStorageProvider(directory)).right;
		await storage.write("test_file", new File(["original"], "old.txt", { type: "text/plain" }));
		const mimeWrite = stub(fs, "writeFile", (path, data) => {
			if (String(path).endsWith(".mimetype")) {
				throw Object.assign(new Error("test MIME write failure"), { code: "EACCES" });
			}
			return realWriteFile(path, data);
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
		expect(fileMimetype(stored)).toBe("text/plain");
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});
