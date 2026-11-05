import { it } from "bdd";
import { expect } from "expect";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stub } from "shared/testing/stub.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import buildFlatFileNodeRepository from "./flat_file_node_repository.ts";

it("flat-file repository leaves memory and disk unchanged when persistence fails", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		const repository = (await buildFlatFileNodeRepository(directory)).right;
		const original = FileNode.create({
			uuid: "original_node",
			title: "Original",
			mimetype: "text/plain",
			owner: "test@antbox.io",
		}).right;
		const added = FileNode.create({ ...original.metadata, uuid: "another_node" }).right;
		const updated = FileNode.create({ ...original.metadata, title: "Updated" }).right;
		await repository.add(original);
		const before = await fs.readFile(`${directory}/nodes_repo.json`, "utf-8");
		const write = stub(fsSync, "writeFileSync", () => {
			throw Object.assign(new Error("test write failure"), { code: "EACCES" });
		});
		try {
			expect((await repository.add(added)).isLeft()).toBe(true);
			expect((await repository.update(updated)).isLeft()).toBe(true);
			expect((await repository.touch(original.uuid)).isLeft()).toBe(true);
			expect((await repository.delete(original.uuid)).isLeft()).toBe(true);
		} finally {
			write.restore();
		}
		expect((await repository.getById(added.uuid)).isLeft()).toBe(true);
		expect((await repository.getById(original.uuid)).right.metadata).toEqual(original.metadata);
		expect(await fs.readFile(`${directory}/nodes_repo.json`, "utf-8")).toBe(before);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

it("flat-file repository commits through atomic rename and cleans failed temporary writes", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		const repository = (await buildFlatFileNodeRepository(directory)).right;
		const original = FileNode.create({
			uuid: "original_node",
			title: "Original",
			mimetype: "text/plain",
			owner: "test@antbox.io",
		}).right;
		await repository.add(original);
		const before = await fs.readFile(`${directory}/nodes_repo.json`, "utf-8");
		const rename = stub(fsSync, "renameSync", () => {
			throw Object.assign(new Error("test rename failure"), { code: "EACCES" });
		});
		try {
			expect((await repository.delete(original.uuid)).isLeft()).toBe(true);
		} finally {
			rename.restore();
		}
		expect((await repository.getById(original.uuid)).isRight()).toBe(true);
		expect(await fs.readFile(`${directory}/nodes_repo.json`, "utf-8")).toBe(before);
		expect(fsSync.readdirSync(directory)).toEqual([
			"nodes_repo.json",
		]);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

it("flat-file touch persists only the current node's timestamp", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		const repository = (await buildFlatFileNodeRepository(directory)).right;
		const original = FileNode.create({
			uuid: "touch_node",
			title: "Current title",
			mimetype: "text/plain",
			owner: "test@antbox.io",
			modifiedTime: "2000-01-01T00:00:00.000Z",
			tags: ["current"],
		}).right;
		await repository.add(original);
		expect((await repository.touch(original.uuid)).isRight()).toBe(true);
		const stored = (await repository.getById(original.uuid)).right;
		expect(stored.modifiedTime).not.toBe(original.modifiedTime);
		expect({ ...stored.metadata, modifiedTime: original.modifiedTime }).toEqual(
			original.metadata,
		);
		const reloaded = (await buildFlatFileNodeRepository(directory)).right;
		expect((await reloaded.getById(original.uuid)).right.metadata).toEqual(stored.metadata);
		expect((await repository.touch("absent_node")).isLeft()).toBe(true);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

it("flat-file node snapshots reject noncloneable writes before changing disk", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		const repository = (await buildFlatFileNodeRepository(directory)).right;
		const original = FileNode.create({
			uuid: "snapshot_node",
			title: "Original",
			mimetype: "text/plain",
			owner: "test@antbox.io",
			tags: ["original"],
		}).right;
		expect((await repository.add(original)).isRight()).toBe(true);
		const before = await fs.readFile(`${directory}/nodes_repo.json`, "utf-8");
		for (const uuid of [original.uuid, "new_node"]) {
			const candidate = FileNode.create({
				...original.metadata,
				uuid,
				title: "Must not be persisted",
				properties: { "audit:invalid": () => {} },
			}).right;
			const result = uuid === original.uuid
				? await repository.update(candidate)
				: await repository.add(candidate);
			expect(result.isLeft()).toBe(true);
			expect(await fs.readFile(`${directory}/nodes_repo.json`, "utf-8")).toBe(before);
			expect((await repository.getById(original.uuid)).right.metadata).toEqual(
				original.metadata,
			);
			expect((await repository.getById("new_node")).isLeft()).toBe(true);
		}
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

it("flat-file node inputs and reads cannot mutate persisted snapshots", async () => {
	const directory = await fs.mkdtemp(join(tmpdir(), "antbox-flat-file-"));
	try {
		const repository = (await buildFlatFileNodeRepository(directory)).right;
		const original = FileNode.create({
			uuid: "snapshot_node",
			title: "Original",
			mimetype: "text/plain",
			owner: "test@antbox.io",
			tags: ["original"],
		}).right;
		expect((await repository.add(original)).isRight()).toBe(true);
		original.tags.push("unsaved input");
		const read = (await repository.getById(original.uuid)).right;
		expect(read.tags).toEqual(["original"]);
		read.tags.push("unsaved read");
		expect((await repository.getById(original.uuid)).right.tags).toEqual(["original"]);
		const reloaded = (await buildFlatFileNodeRepository(directory)).right;
		expect((await reloaded.getById(original.uuid)).right.tags).toEqual(["original"]);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});
