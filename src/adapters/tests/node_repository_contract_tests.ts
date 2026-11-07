import { EMBEDDING_DIMENSIONS } from "domain/nodes/embedding.ts";
import process from "node:process";
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
	const args = process.env.TEST_PARAMS?.split(";");
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
		const embedding = Array.from(
			{ length: EMBEDDING_DIMENSIONS },
			(_, index) => index === 0 ? 1 : 0,
		);
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

function unitVector(angle: number): number[] {
	const vector = new Array(EMBEDDING_DIMENSIONS).fill(0);
	vector[0] = Math.cos(angle);
	vector[1] = Math.sin(angle);
	return vector;
}

async function addFolder(uuid: string, aspects: string[]): Promise<void> {
	const node = FolderNode.create({
		uuid,
		title: uuid,
		owner: "tester@antbox.io",
		group: "testers",
		aspects,
	}).right;
	expect((await repo.add(node)).isRight()).toBe(true);
}

describe("vectorSearch with filters", () => {
	const query = unitVector(0);
	const hidden = Array.from({ length: 60 }, (_, i) => `vs-hidden-${i}`);
	const allowed = Array.from({ length: 45 }, (_, i) => `vs-allowed-${i}`);

	beforeAll(async () => {
		if (!repo.supportsEmbeddings()) return;
		for (const [i, uuid] of hidden.entries()) {
			await addFolder(uuid, ["vs-hidden"]);
			await repo.upsertEmbedding(uuid, unitVector(0.001 * i), `hidden ${i}`);
		}
		for (const [i, uuid] of allowed.entries()) {
			await addFolder(uuid, ["vs-allowed"]);
			await repo.upsertEmbedding(uuid, unitVector(0.5 + 0.01 * i), `allowed ${i}`);
		}
	});

	test("returns only nodes that pass the filters, best first", async () => {
		if (!repo.supportsEmbeddings()) return;
		const result = await repo.vectorSearch(query, 5, {
			filters: [[["aspects", "contains", "vs-allowed"]]],
		});
		expect(result.right.nodes.map((n) => n.node.uuid)).toEqual(allowed.slice(0, 5));
		const scores = result.right.nodes.map((n) => n.score);
		expect([...scores].sort((a, b) => b - a)).toEqual(scores);
		expect(result.right.nodes[0].content).toBe("allowed 0");
	});

	test("applies topK after the filters", async () => {
		if (!repo.supportsEmbeddings()) return;
		const result = await repo.vectorSearch(query, 45, {
			filters: [[["aspects", "contains", "vs-allowed"]]],
		});
		expect(result.right.nodes.map((n) => n.node.uuid)).toEqual(allowed);
	});

	test("an impossible filter returns nothing and no filter returns every node", async () => {
		if (!repo.supportsEmbeddings()) return;
		const none = await repo.vectorSearch(query, 10, { filters: [[["uuid", "in", []]]] });
		expect(none.right.nodes).toHaveLength(0);
		const all = await repo.vectorSearch(query, 10, { filters: [] });
		expect(all.right.nodes).toHaveLength(10);
		expect(all.right.nodes.map((n) => n.node.uuid)).toContain(hidden[0]);
		const noOptions = await repo.vectorSearch(query, 10);
		expect(noOptions.right.nodes.map((n) => n.node.uuid)).toEqual(
			all.right.nodes.map((n) => n.node.uuid),
		);
	});
});

describe("embedding status", () => {
	const vector = unitVector(1);
	const counts = async () => (await repo.countEmbeddingStatuses()).right;
	const status = async (uuid: string) => (await repo.getEmbeddingStatuses([uuid])).right[uuid];

	test("a new node is pending and an indexed node is indexed", async () => {
		if (!repo.supportsEmbeddings()) return;
		const before = await counts();
		await addFolder("status-indexed", []);
		expect((await status("status-indexed")).status).toBeNull();
		expect((await counts()).pending).toBe(before.pending + 1);

		expect((await repo.upsertEmbedding("status-indexed", vector, "content")).isRight()).toBe(
			true,
		);
		const record = await status("status-indexed");
		expect(record.status).toBe("indexed");
		expect(record.error).toBeUndefined();
		expect(typeof record.at).toBe("string");
		const after = await counts();
		expect(after.indexed).toBe(before.indexed + 1);
		expect(after.pending).toBe(before.pending);
	});

	test("failed keeps the vector and stores the error", async () => {
		if (!repo.supportsEmbeddings()) return;
		await addFolder("status-failed", ["status-failed"]);
		await repo.upsertEmbedding("status-failed", vector, "kept content");
		expect((await repo.setEmbeddingStatus("status-failed", "failed", "ocr: boom")).isRight())
			.toBe(true);

		const record = await status("status-failed");
		expect(record.status).toBe("failed");
		expect(record.error).toBe("ocr: boom");
		expect((await repo.getEmbeddingContents(["status-failed"])).right["status-failed"]).toBe(
			"kept content",
		);
		const found = await repo.vectorSearch(vector, 1, {
			filters: [[["aspects", "contains", "status-failed"]]],
		});
		expect(found.right.nodes.map((n) => n.node.uuid)).toEqual(["status-failed"]);
	});

	test("skipped removes the vector and the content", async () => {
		if (!repo.supportsEmbeddings()) return;
		await addFolder("status-skipped", ["status-skipped"]);
		await repo.upsertEmbedding("status-skipped", vector, "content");
		expect((await repo.setEmbeddingStatus("status-skipped", "skipped")).isRight()).toBe(true);

		expect((await status("status-skipped")).status).toBe("skipped");
		expect((await repo.getEmbeddingContents(["status-skipped"])).right["status-skipped"])
			.toBeUndefined();
		const found = await repo.vectorSearch(vector, 1, {
			filters: [[["aspects", "contains", "status-skipped"]]],
		});
		expect(found.right.nodes).toHaveLength(0);
	});

	test("deleteEmbedding clears the vector, the content and the status", async () => {
		if (!repo.supportsEmbeddings()) return;
		await addFolder("status-deleted", []);
		await repo.upsertEmbedding("status-deleted", vector, "content");
		await repo.setEmbeddingStatus("status-deleted", "failed", "boom");
		expect((await repo.deleteEmbedding("status-deleted")).isRight()).toBe(true);

		const record = await status("status-deleted");
		expect(record.status).toBeNull();
		expect(record.error).toBeUndefined();
		expect((await repo.getEmbeddingContents(["status-deleted"])).right["status-deleted"])
			.toBeUndefined();
	});

	test("update and touch keep the status and the vector", async () => {
		if (!repo.supportsEmbeddings()) return;
		await addFolder("status-preserved", ["status-preserved"]);
		await repo.upsertEmbedding("status-preserved", vector, "content");
		await repo.setEmbeddingStatus("status-preserved", "failed", "ocr: kept");

		const node = (await repo.getById("status-preserved")).right;
		expect(node.update({ title: "Renamed" }).isRight()).toBe(true);
		expect((await repo.update(node)).isRight()).toBe(true);
		expect((await repo.touch("status-preserved")).isRight()).toBe(true);

		const record = await status("status-preserved");
		expect(record.status).toBe("failed");
		expect(record.error).toBe("ocr: kept");
		const found = await repo.vectorSearch(vector, 1, {
			filters: [[["aspects", "contains", "status-preserved"]]],
		});
		expect(found.right.nodes.map((n) => n.node.uuid)).toEqual(["status-preserved"]);
		expect(found.right.nodes[0].node.title).toBe("Renamed");
	});

	test("unknown nodes are left out of the statuses", async () => {
		if (!repo.supportsEmbeddings()) return;
		const result = await repo.getEmbeddingStatuses(["missing-node"]);
		expect(result.right).toEqual({});
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
