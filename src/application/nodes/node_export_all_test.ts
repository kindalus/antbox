import { describe, it } from "bdd";
import { expect } from "expect";
import { strFromU8, unzipSync } from "fflate";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { right } from "shared/either.ts";
import { exportAllFiles, MAX_EXPORT_ALL_BYTES } from "./node_export_all.ts";

function metadata(uuid: string, title: string, size = 0): NodeMetadata {
	return {
		uuid,
		title,
		size,
		fid: uuid,
		parent: "files",
		mimetype: "text/plain",
		owner: "owner@example.com",
		createdTime: "2026-01-01T00:00:00Z",
		modifiedTime: "2026-01-01T00:00:00Z",
	};
}

describe("exportAllFiles", () => {
	it("flattens unsafe names, preserves Unicode, and resolves case-insensitive collisions", async () => {
		const titles = [
			"../../report.txt",
			"Report.txt",
			"report.txt",
			"C:\\private\\file.pdf",
			"..",
			"CON.txt",
			"你好.txt",
			"__proto__",
			"/etc/passwd",
		];
		const result = await exportAllFiles(titles.map((_, i) => `file-${i}`), {
			prepareFile: (uuid) =>
				Promise.resolve(right(metadata(uuid, titles[Number(uuid.slice(5))]))),
			readFile: (uuid) => Promise.resolve(right(new File([uuid], "file"))),
		});
		expect(result.isRight()).toBe(true);
		const zip = unzipSync(new Uint8Array(await result.right.arrayBuffer()));
		expect(Object.keys(zip)).toEqual([
			"_.._report.txt",
			"Report.txt",
			"report (2).txt",
			"C__private_file.pdf",
			"file",
			"_CON.txt",
			"你好.txt",
			"___proto__",
			"_etc_passwd",
		]);
		for (const name of Object.keys(zip)) expect(/[\/\\]/.test(name)).toBe(false);
		expect(strFromU8(zip["你好.txt"])).toBe("file-6");
	});

	it("checks metadata size before any storage reads", async () => {
		let reads = 0;
		const result = await exportAllFiles(["large"], {
			prepareFile: (uuid) =>
				Promise.resolve(right(metadata(uuid, "large.txt", MAX_EXPORT_ALL_BYTES + 1))),
			readFile: () => {
				reads++;
				return Promise.resolve(right(new File([], "large.txt")));
			},
		});
		expect(result.isLeft()).toBe(true);
		expect(reads).toBe(0);
	});

	it("checks actual cumulative size even when metadata underreports it", async () => {
		let oversizedBodyRead = false;
		const large = new File([], "large.txt");
		Object.defineProperty(large, "size", { value: MAX_EXPORT_ALL_BYTES });
		large.arrayBuffer = () => {
			oversizedBodyRead = true;
			return Promise.resolve(new ArrayBuffer(0));
		};
		const result = await exportAllFiles(["small", "large"], {
			prepareFile: (uuid) => Promise.resolve(right(metadata(uuid, `${uuid}.txt`))),
			readFile: (uuid) =>
				Promise.resolve(right(uuid === "small" ? new File(["a"], "small.txt") : large)),
		});
		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) expect(result.value.errorCode).toBe("BadRequestError");
		expect(oversizedBodyRead).toBe(false);
	});

	it("accepts empty files and repeated IDs without duplicating entries", async () => {
		const result = await exportAllFiles(Array(101).fill("empty"), {
			prepareFile: (uuid) => Promise.resolve(right(metadata(uuid, "empty.txt"))),
			readFile: () => Promise.resolve(right(new File([], "empty.txt"))),
		});
		expect(result.isRight()).toBe(true);
		const zip = unzipSync(new Uint8Array(await result.right.arrayBuffer()));
		expect(Object.keys(zip)).toEqual(["empty.txt"]);
		expect(zip["empty.txt"].length).toBe(0);
	});

	it("accepts exactly 100 unique files", async () => {
		const uuids = Array.from({ length: 100 }, (_, i) => `file-${i}`);
		const result = await exportAllFiles(uuids, {
			prepareFile: (uuid) => Promise.resolve(right(metadata(uuid, `${uuid}.txt`))),
			readFile: (uuid) => Promise.resolve(right(new File([uuid], `${uuid}.txt`))),
		});
		expect(result.isRight()).toBe(true);
		const zip = unzipSync(new Uint8Array(await result.right.arrayBuffer()));
		expect(Object.keys(zip)).toEqual(uuids.map((uuid) => `${uuid}.txt`));
	});

	it("converts unexpected failures into Either without exposing their details", async () => {
		const result = await exportAllFiles(["file"], {
			prepareFile: () => {
				throw new Error("secret storage credential");
			},
			readFile: () => Promise.resolve(right(new File([], "file"))),
		});
		expect(result.isLeft()).toBe(true);
		if (result.isLeft()) expect(result.value.message).toBe("Failed to export files");
	});
});
