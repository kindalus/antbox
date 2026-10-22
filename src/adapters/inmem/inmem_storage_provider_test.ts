import { expect } from "expect";
import { InMemoryStorageProvider } from "./inmem_storage_provider.ts";

Deno.test("in-memory storage treats inherited object names as ordinary UUIDs", async () => {
	const storage = new InMemoryStorageProvider();
	const file = new File(["document content"], "document.txt", { type: "text/plain" });
	for (const uuid of ["__proto__", "constructor", "toString"]) {
		expect((await storage.read(uuid)).isLeft()).toBe(true);
		expect((await storage.delete(uuid)).isLeft()).toBe(true);
		expect((await storage.write(uuid, file)).isRight()).toBe(true);
		expect((await storage.read(uuid)).right).toBe(file);
		expect((await storage.delete(uuid)).isRight()).toBe(true);
		expect((await storage.read(uuid)).isLeft()).toBe(true);
	}
	expect(Object.keys(storage.fs)).toHaveLength(0);
});
