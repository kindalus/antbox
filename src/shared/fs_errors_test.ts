import { describe, it } from "bdd";
import { expect } from "expect";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isAlreadyExistsError,
	isNotFoundError,
	isNotSupportedError,
	isPermissionDeniedError,
} from "./fs_errors.ts";

function capture(fn: () => unknown): unknown {
	try {
		fn();
	} catch (error) {
		return error;
	}
	throw new Error("expected failure");
}

async function captureAsync(fn: () => Promise<unknown>): Promise<unknown> {
	try {
		await fn();
	} catch (error) {
		return error;
	}
	throw new Error("expected failure");
}

describe("fs_errors", () => {
	const dir = mkdtempSync(join(tmpdir(), "fs-errors-"));

	it("detects not found from node:fs sync and async", async () => {
		expect(isNotFoundError(capture(() => readFileSync(join(dir, "missing"))))).toBe(true);
		expect(isNotFoundError(await captureAsync(() => readFile(join(dir, "missing"))))).toBe(true);
	});

	it("detects already exists from node:fs", () => {
		expect(isAlreadyExistsError(capture(() => mkdirSync(dir)))).toBe(true);
	});

	it("detects permission denied from node:fs", () => {
		const error = capture(() => writeFileSync("/proc/version", "x"));
		expect(isPermissionDeniedError(error)).toBe(true);
	});

	it("detects not supported by code", () => {
		expect(isNotSupportedError({ code: "ENOTSUP" })).toBe(true);
		expect(isNotSupportedError({ code: "ENOSYS" })).toBe(true);
		expect(isNotSupportedError({ code: "ENOENT" })).toBe(false);
	});

	it("rejects values without a matching code", () => {
		for (const value of [null, undefined, "ENOENT", 1, new Error("x"), { code: 2 }]) {
			expect(isNotFoundError(value)).toBe(false);
			expect(isAlreadyExistsError(value)).toBe(false);
			expect(isPermissionDeniedError(value)).toBe(false);
			expect(isNotSupportedError(value)).toBe(false);
		}
		expect(isPermissionDeniedError({ code: "EPERM" })).toBe(true);
		expect(isPermissionDeniedError({ code: "EACCES" })).toBe(true);
	});
});
