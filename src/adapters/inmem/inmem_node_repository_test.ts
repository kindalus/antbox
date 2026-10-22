import { expect } from "expect";
import { FileNode } from "domain/nodes/file_node.ts";
import type { NodeLike } from "domain/node_like.ts";
import { InMemoryNodeRepository } from "./inmem_node_repository.ts";

Deno.test("in-memory repository treats inherited object names as ordinary UUIDs", async () => {
	const repository = new InMemoryNodeRepository();
	for (const uuid of ["__proto__", "constructor", "toString"]) {
		expect((await repository.getById(uuid)).isLeft()).toBe(true);
		const node = FileNode.create({
			uuid,
			title: "Document",
			mimetype: "text/plain",
			owner: "test@antbox.io",
		}).right;
		expect((await repository.add(node)).isRight()).toBe(true);
		expect((await repository.getById(uuid)).right.uuid).toBe(uuid);
		await repository.upsertEmbedding(uuid, [1, 0], "document content");
		expect((await repository.getEmbeddingContents([uuid])).right[uuid]).toBe("document content");
		expect(repository.data[uuid].uuid).toBe(uuid);
		expect((await repository.delete(uuid)).isRight()).toBe(true);
		expect((await repository.getById(uuid)).isLeft()).toBe(true);
	}
	expect(repository.count).toBe(0);
});

Deno.test("duplicate additions preserve the node and its embedding", async () => {
	const repository = new InMemoryNodeRepository();
	const original = FileNode.create({
		uuid: "same_uuid",
		title: "Original",
		mimetype: "text/plain",
		owner: "test@antbox.io",
	}).right;
	const replacement = FileNode.create({ ...original.metadata, title: "Replacement" }).right;
	await repository.add(original);
	await repository.upsertEmbedding(original.uuid, [1, 0], "original content");
	expect((await repository.add(replacement)).isLeft()).toBe(true);
	expect((await repository.getById(original.uuid)).right.title).toBe("Original");
	expect((await repository.getEmbeddingContents([original.uuid])).right[original.uuid]).toBe(
		"original content",
	);
});

Deno.test("touch replaces only the stored timestamp and preserves embeddings", async () => {
	const repository = new InMemoryNodeRepository();
	const original = FileNode.create({
		uuid: "touch_node",
		title: "Current title",
		mimetype: "text/plain",
		owner: "test@antbox.io",
		modifiedTime: "2000-01-01T00:00:00.000Z",
		tags: ["current"],
	}).right;
	await repository.add(original);
	await repository.upsertEmbedding(original.uuid, [1, 0], "current embedding");
	expect((await repository.touch(original.uuid)).isRight()).toBe(true);
	const stored = (await repository.getById(original.uuid)).right;
	expect(stored.modifiedTime).not.toBe(original.modifiedTime);
	expect({ ...stored.metadata, modifiedTime: original.modifiedTime }).toEqual(original.metadata);
	expect((await repository.getEmbeddingContents([original.uuid])).right[original.uuid]).toBe(
		"current embedding",
	);
	expect((await repository.touch("absent_node")).isLeft()).toBe(true);
	expect(repository.count).toBe(1);
});

function snapshotNode(uuid = "snapshot_node") {
	return FileNode.create({
		uuid,
		fid: "snapshot-file",
		title: "Original",
		mimetype: "text/plain",
		owner: "test@antbox.io",
		tags: ["original"],
		aspects: ["custom"],
		properties: { "custom:nested": { values: ["original"] } },
	}).right;
}

function mutateSnapshot(node: NodeLike) {
	node.metadata.tags!.push("unsaved");
	(node.metadata.properties!["custom:nested"] as { values: string[] }).values.push("unsaved");
	node.update({ title: "Unsaved" });
}

Deno.test("in-memory repository snapshots every node input boundary", async () => {
	for (const method of ["constructor", "add", "update", "records"] as const) {
		const node = snapshotNode();
		const expected = structuredClone(node.metadata);
		const repository = method === "constructor"
			? new InMemoryNodeRepository({ [node.uuid]: node })
			: new InMemoryNodeRepository();
		if (method === "add") await repository.add(node);
		if (method === "update") {
			await repository.add(snapshotNode());
			await repository.update(node);
		}
		if (method === "records") repository.records = [node];
		mutateSnapshot(node);
		const stored = (await repository.getById(node.uuid)).right;
		expect(stored instanceof FileNode).toBe(true);
		expect(stored.metadata).toEqual(expected);
	}
});

Deno.test("in-memory reads return independent nested metadata and domain objects", async () => {
	const repository = new InMemoryNodeRepository();
	const node = snapshotNode();
	await repository.add(node);
	await repository.upsertEmbedding(node.uuid, [1, 0], "original content");
	const reads: Array<() => Promise<NodeLike> | NodeLike> = [
		async () => (await repository.getById(node.uuid)).right,
		async () => (await repository.getByFid(node.fid)).right,
		() => repository.data[node.uuid],
		() => repository.records[0],
		async () => (await repository.filter([])).nodes[0],
		async () => (await repository.vectorSearch([1, 0], 1)).right.nodes[0].node,
	];
	for (const read of reads) {
		const result = await read();
		expect(result instanceof FileNode).toBe(true);
		mutateSnapshot(result);
		expect((await repository.getById(node.uuid)).right.metadata).toEqual(node.metadata);
	}
});

Deno.test("in-memory writes reject unsnapshotable nodes without changing stored state", async () => {
	const repository = new InMemoryNodeRepository();
	const original = snapshotNode();
	await repository.add(original);
	await repository.upsertEmbedding(original.uuid, [1, 0], "original content");
	for (const uuid of [original.uuid, "new_node"]) {
		const invalid = snapshotNode(uuid);
		invalid.properties["custom:callback"] = () => undefined;
		const result = uuid === original.uuid
			? await repository.update(invalid)
			: await repository.add(invalid);
		expect(result.isLeft()).toBe(true);
	}
	const invalid = snapshotNode();
	expect(invalid.update({ title: "" }).isLeft()).toBe(true);
	expect((await repository.update(invalid)).isLeft()).toBe(true);
	expect(() => {
		repository.records = [snapshotNode("replacement"), invalid];
	}).toThrow();
	expect(repository.count).toBe(1);
	expect((await repository.getById(original.uuid)).right.metadata).toEqual(original.metadata);
	expect((await repository.getEmbeddingContents([original.uuid])).right[original.uuid]).toBe(
		"original content",
	);
});

Deno.test("in-memory embeddings copy input arrays and reject failed copies atomically", async () => {
	const repository = new InMemoryNodeRepository();
	const node = snapshotNode();
	await repository.add(node);
	const embedding = [1, 0];
	await repository.upsertEmbedding(node.uuid, embedding, "original content");
	embedding[0] = 0;
	embedding[1] = 1;
	const invalid = [() => undefined] as unknown as number[];
	expect((await repository.upsertEmbedding(node.uuid, invalid, "replacement")).isLeft()).toBe(
		true,
	);
	const result = (await repository.vectorSearch([1, 0], 1)).right.nodes[0];
	expect(result.score).toBe(1);
	expect(result.content).toBe("original content");
});
