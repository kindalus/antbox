import { expect } from "expect";
import { stub } from "mock";
import { FileNode } from "domain/nodes/file_node.ts";
import buildFlatFileNodeRepository from "./flat_file_node_repository.ts";

Deno.test("flat-file repository leaves memory and disk unchanged when persistence fails", async () => {
	const directory = await Deno.makeTempDir();
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
		const before = await Deno.readTextFile(`${directory}/nodes_repo.json`);
		const write = stub(Deno, "writeFileSync", () => {
			throw new Deno.errors.PermissionDenied("test write failure");
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
		expect(await Deno.readTextFile(`${directory}/nodes_repo.json`)).toBe(before);
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
});

Deno.test("flat-file repository commits through atomic rename and cleans failed temporary writes", async () => {
	const directory = await Deno.makeTempDir();
	try {
		const repository = (await buildFlatFileNodeRepository(directory)).right;
		const original = FileNode.create({
			uuid: "original_node",
			title: "Original",
			mimetype: "text/plain",
			owner: "test@antbox.io",
		}).right;
		await repository.add(original);
		const before = await Deno.readTextFile(`${directory}/nodes_repo.json`);
		const rename = stub(Deno, "renameSync", () => {
			throw new Deno.errors.PermissionDenied("test rename failure");
		});
		try {
			expect((await repository.delete(original.uuid)).isLeft()).toBe(true);
		} finally {
			rename.restore();
		}
		expect((await repository.getById(original.uuid)).isRight()).toBe(true);
		expect(await Deno.readTextFile(`${directory}/nodes_repo.json`)).toBe(before);
		expect([...Deno.readDirSync(directory)].map((entry) => entry.name)).toEqual([
			"nodes_repo.json",
		]);
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
});

Deno.test("flat-file touch persists only the current node's timestamp", async () => {
	const directory = await Deno.makeTempDir();
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
		await Deno.remove(directory, { recursive: true });
	}
});

Deno.test("flat-file node snapshots reject noncloneable writes before changing disk", async () => {
	const directory = await Deno.makeTempDir();
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
		const before = await Deno.readTextFile(`${directory}/nodes_repo.json`);
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
			expect(await Deno.readTextFile(`${directory}/nodes_repo.json`)).toBe(before);
			expect((await repository.getById(original.uuid)).right.metadata).toEqual(
				original.metadata,
			);
			expect((await repository.getById("new_node")).isLeft()).toBe(true);
		}
	} finally {
		await Deno.remove(directory, { recursive: true });
	}
});

Deno.test("flat-file node inputs and reads cannot mutate persisted snapshots", async () => {
	const directory = await Deno.makeTempDir();
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
		await Deno.remove(directory, { recursive: true });
	}
});
