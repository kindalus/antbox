import { afterAll, beforeAll, describe, test } from "bdd";
import { expect } from "expect";
import { providerFrom } from "../module_configuration_parser.ts";
import { type NodeRepository } from "domain/nodes/node_repository.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { FileNode } from "domain/nodes/file_node.ts";
import { UuidGenerator } from "shared/uuid_generator.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { Either } from "shared/either.ts";
import { Nodes } from "domain/nodes/nodes.ts";

let repo: NodeRepository;
const uuids = Array.from({ length: 4 }, () => UuidGenerator.generate());

beforeAll(async () => {
	const args = Deno.env.get("TEST_PARAMS")?.split(";");
	if (!args) {
		throw new Error("No test arguments provided.");
	}

	const [modulePath, ...params] = args;

	repo = (await providerFrom<NodeRepository>([modulePath, ...params]))!;
	if (!repo) {
		throw new Error("Could not load repository");
	}

	await cleanDb();
	await populateDb();
});

afterAll(async () => {
	if ("close" in repo && typeof repo.close === "function") {
		await repo.close();
	}
});

describe("filter", () => {
	test("get all nodes", async () => {
		const nodes = await repo.filter([]);
		expect(nodes.nodes.length).toBe(4);
	});

	test("empty AND groups make their OR expression unconditional", async () => {
		expect((await repo.filter([[]])).nodes).toHaveLength(4);
		expect((await repo.filter([[], [["title", "==", "missing"]]])).nodes).toHaveLength(4);
	});

	test("get folders only", async () => {
		const nodes = await repo.filter([
			["mimetype", "==", Nodes.FOLDER_MIMETYPE],
		]);
		expect(nodes.nodes).toHaveLength(2);
		expect(Nodes.isFolder(nodes.nodes[0])).toBeTruthy();
	});

	test("get images or with name 'Folder 1'", async () => {
		const nodes = await repo.filter([
			[["mimetype", "==", "image/jpeg"]],
			[["title", "==", "Folder 1"]],
		]);
		expect(nodes.nodes.length).toBe(2);
	});

	test("get nodes by aspect contains", async () => {
		const nodes = await repo.filter([
			["aspects", "contains", "finance"],
		]);

		expect(nodes.nodes).toHaveLength(1);
		expect(nodes.nodes[0].uuid).toBe(uuids[2]);
	});

	test("get all nodes, second page", async () => {
		let result = await repo.filter([]);
		expect(result.nodes.length).toBe(4);

		result = await repo.filter([], 4, 2);
		expect(result.nodes.length).toBe(0);
	});

	test("treats SQL syntax in field names as data", async () => {
		for (
			const field of [
				"title') OR 1=1 OR json_extract(body, '$.absent",
				"title' IS NOT NULL OR TRUE OR body->>'absent",
			]
		) {
			const result = await repo.filter([[field, "match", "does-not-exist"]]);
			expect(result.nodes).toHaveLength(0);
		}
	});

	test("matches quoted custom property names across repeated conditions", async () => {
		const result = await repo.filter([
			["properties.finance:owner's-code", "contains-all", ["paid", "approved"]],
			["title", "==", "Essay.pdf"],
		]);
		expect(result.nodes.map((node) => node.uuid)).toEqual([uuids[2]]);
	});

	test("matches literal punctuation and ordered words without query syntax", async () => {
		for (const query of ["%_", "(a+)+$", "[invoice]", "INVOICE ready"]) {
			const result = await repo.filter([["fulltext", "match", query]]);
			expect(result.nodes.map((node) => node.uuid)).toEqual([uuids[2]]);
		}
		const missing = await repo.filter([["fulltext", "match", "[missing]"]]);
		expect(missing.nodes).toHaveLength(0);
	});

	test("handles empty filter sets without invalid SQL", async () => {
		for (const operator of ["contains-any", "in"] as const) {
			const result = await repo.filter([["aspects", operator, []]]);
			expect(result.nodes).toHaveLength(0);
		}
		for (const operator of ["contains-all", "not-in"] as const) {
			const result = await repo.filter([["aspects", operator, []]]);
			expect(result.nodes).toHaveLength(4);
		}
	});

	test("ignores structured match and ordering targets without discarding valid OR branches", async () => {
		for (const target of [{ toString: 0, valueOf: 0 }, {}, ["Folder"]]) {
			for (const operator of ["match", ">", ">=", "<", "<="] as const) {
				const result = await repo.filter([
					[["title", operator, target]],
					[["title", "==", "Essay.pdf"]],
				]);
				expect(result.nodes.map((node) => node.uuid)).toEqual([uuids[2]]);
			}
		}
	});
});

describe("getById", () => {
	test("should find", async () => {
		const testCases = [
			[uuids[0], Nodes.FOLDER_MIMETYPE, "Folder 1"],
			[uuids[2], "application/pdf", "Essay.pdf"],
			[uuids[3], "image/jpeg", "Image.jpg"],
		];

		for (const [uuid, mimetype, title] of testCases) {
			const n = await repo.getById(uuid);
			expect(n.isRight()).toBeTruthy();
			expect(n.right.uuid).toBe(uuid);
			expect(n.right.title).toBe(title);
			expect(n.right.mimetype).toBe(mimetype);
		}
	});

	test("should not find", async () => {
		const n = await repo.getById("unknown");

		expect(n.isRight()).toBeFalsy();
		expect(n.value).toBeInstanceOf(NodeNotFoundError);
	});
});

describe("getByFid", () => {
	test("should find", async () => {
		const n = (await repo.getByFid("image-jpg")).right;

		expect(n.uuid).toBe(uuids[3]);
		expect(n.title).toBe("Image.jpg");
	});

	test("should not find", async () => {
		const n = await repo.getByFid("unknown");

		expect(n.isRight()).toBeFalsy();
		expect(n.value).toBeInstanceOf(NodeNotFoundError);
	});
});

describe("update", () => {
	test("should update", async () => {
		(await repo.getById(uuids[0])).right;

		const uuid = UuidGenerator.generate();
		const original = FileNode.create({
			uuid,
			title: "Original",
			mimetype: "text/plain",
			owner: "tester@domain.com",
			group: "testers",
		}).right;

		let result: Either<unknown, unknown> = await repo.add(original);
		expect(result.isRight()).toBeTruthy();

		const updated = FileNode.create({
			uuid,
			title: "Updated",
			owner: "tester@domain.com",
			group: "testers",
			mimetype: "text/css",
		}).right;

		result = await repo.update(updated);
		expect(
			result.isRight(),
			JSON.stringify(result.value, null, 2),
		).toBeTruthy();

		const retrieved = (await repo.getById(uuid)).right;
		expect(retrieved.title).toBe("Updated");
		expect(retrieved.mimetype).toBe("text/css");
	});
});

describe("delete", () => {
	test("should delete", async () => {
		const uuid = UuidGenerator.generate();
		const original = FileNode.create({
			uuid,
			title: "Original",
			mimetype: "text/plain",
			owner: "tester@domain.io",
			group: "testers",
		}).right;

		let result: Either<unknown, unknown> = await repo.add(original);
		expect(result.isRight()).toBeTruthy();

		result = await repo.delete(uuid);
		expect(result.isRight()).toBeTruthy();

		const n = await repo.getById(uuid);
		expect(n.isRight()).toBeFalsy();
		expect(n.value).toBeInstanceOf(NodeNotFoundError);
	});

	test("should not delete", async () => {
		const result = await repo.delete("unknown");
		expect(result.isRight()).toBeFalsy();
		expect(result.value).toBeInstanceOf(NodeNotFoundError);
	});
});

describe("touch", () => {
	test("changes only modifiedTime and preserves embedding content", async () => {
		const uuid = UuidGenerator.generate();
		const node = FileNode.create({
			uuid,
			title: "Touch preserves metadata",
			mimetype: "text/plain",
			owner: "tester@antbox.io",
			modifiedTime: "2020-01-01T00:00:00.000Z",
			locked: true,
			lockedBy: "owner@antbox.io",
			tags: ["original"],
			properties: { "audit:details": { nested: [1, 2] } },
		}).right;
		expect((await repo.add(node)).isRight()).toBe(true);
		const before = structuredClone((await repo.getById(uuid)).right.metadata);
		const embedding = Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0);
		if (repo.supportsEmbeddings()) {
			expect((await repo.upsertEmbedding(uuid, embedding, "Retained embedding")).isRight()).toBe(
				true,
			);
		}

		expect((await repo.touch(uuid)).isRight()).toBe(true);

		const after = (await repo.getById(uuid)).right.metadata;
		expect(after.modifiedTime).not.toBe(before.modifiedTime);
		expect({ ...after, modifiedTime: before.modifiedTime }).toEqual(before);
		if (repo.supportsEmbeddings()) {
			expect((await repo.getEmbeddingContents([uuid])).right[uuid]).toBe("Retained embedding");
			const nearest = (await repo.vectorSearch(embedding, 1)).right.nodes[0];
			expect(nearest.node.uuid).toBe(uuid);
			expect(nearest.score).toBeCloseTo(1);
		}
	});

	test("returns not found without creating a missing node", async () => {
		const uuid = UuidGenerator.generate();
		const result = await repo.touch(uuid);
		expect(result.value).toBeInstanceOf(NodeNotFoundError);
		expect((await repo.getById(uuid)).isLeft()).toBe(true);
	});
});

async function cleanDb() {
	const nodes = await repo.filter([], 1_000_000);
	await Promise.allSettled(nodes.nodes.map((n) => repo.delete(n.uuid)));
}

async function populateDb() {
	const owner = "tester@antbox.io";
	const group = "testers";

	const nodes = [];

	nodes.push(
		FolderNode.create({
			uuid: uuids[0],
			title: "Folder 1",
			owner,
			group,
			aspects: ["workspace"],
		}),
		FolderNode.create({
			uuid: uuids[1],
			title: "Folder 2",
			owner,
			group,
			aspects: ["archive"],
		}),
		FileNode.create({
			uuid: uuids[2],
			title: "Essay.pdf",
			mimetype: "application/pdf",
			owner,
			group,
			aspects: ["finance", "document"],
			properties: { "finance:owner's-code": ["paid", "approved"] },
			fulltext: "Cost 10%_off (a+)+$ [invoice]\nreview-ready",
		}),
		FileNode.create({
			uuid: uuids[3],
			fid: "image-jpg",
			title: "Image.jpg",
			mimetype: "image/jpeg",
			owner,
			group,
			aspects: ["media"],
		}),
	);

	await Promise.allSettled(nodes.map((n) => repo.add(n.right)));
}
