import { describe, it } from "bdd";
import { expect } from "expect";
import { fileMimetype, normalizeMimetype } from "./mimetype.ts";

describe("normalizeMimetype", () => {
	it("removes a utf-8 charset parameter", () => {
		expect(normalizeMimetype("text/plain;charset=utf-8")).toBe("text/plain");
		expect(normalizeMimetype("text/plain; charset=UTF-8")).toBe("text/plain");
	});

	it("keeps other charsets and parameters", () => {
		expect(normalizeMimetype("text/plain;charset=iso-8859-1")).toBe(
			"text/plain;charset=iso-8859-1",
		);
		expect(normalizeMimetype("multipart/form-data;boundary=x")).toBe(
			"multipart/form-data;boundary=x",
		);
		expect(normalizeMimetype("text/plain;charset=utf-8;format=flowed")).toBe(
			"text/plain;format=flowed",
		);
	});

	it("lowercases and keeps empty", () => {
		expect(normalizeMimetype("Text/HTML")).toBe("text/html");
		expect(normalizeMimetype("")).toBe("");
	});
});

describe("fileMimetype", () => {
	it("normalizes the blob type", () => {
		expect(fileMimetype(new File(["a"], "a.txt", { type: "text/plain;charset=utf-8" })))
			.toBe("text/plain");
		expect(fileMimetype(new Blob(["a"]))).toBe("");
	});
});
