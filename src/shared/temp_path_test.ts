import { describe, it } from "bdd";
import { expect } from "expect";
import { existsSync } from "node:fs";
import { tempPath } from "./temp_path.ts";

describe("tempPath", () => {
	it("joins directory, prefix and a uuid without creating anything", () => {
		const path = tempPath("/tmp/antbox-nonexistent", ".tmp-");
		expect(path).toMatch(/^\/tmp\/antbox-nonexistent\/\.tmp-[0-9a-f-]{36}$/);
		expect(existsSync(path)).toBe(false);
	});

	it("is unique per call", () => {
		expect(tempPath("/a", "p")).not.toBe(tempPath("/a", "p"));
	});
});
