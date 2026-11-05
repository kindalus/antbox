import { describe, it } from "bdd";
import { expect } from "expect";
import { loadDoc } from "./index.ts";

describe("loadDoc", () => {
	it("loads a document and strips its frontmatter", async () => {
		const doc = await loadDoc("overview");

		expect(doc?.mimetype).toBe("text/markdown");
		expect(doc?.content.startsWith("---")).toBe(false);
	});

	it("returns null for a missing document", async () => {
		expect(await loadDoc("does-not-exist")).toBeNull();
	});

	it("does not read files outside the docs directory", async () => {
		expect(await loadDoc("../README")).toBeNull();
		expect(await loadDoc("../../etc/passwd")).toBeNull();
		expect(await loadDoc("/etc/passwd")).toBeNull();
	});
});
