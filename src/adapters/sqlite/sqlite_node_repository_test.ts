import { describe, it } from "bdd";
import { expect } from "expect";
import { FileNode } from "domain/nodes/file_node.ts";
import { SqliteNodeRepository } from "./sqlite_node_repository.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

describe("SqliteNodeRepository embedding status migration", () => {
	it("adds the status columns to an old database and marks stored vectors as indexed", async () => {
		const dir = mkdtempSync(join(tmpdir(), "antbox-sqlite-status-"));
		try {
			const old = new DatabaseSync(join(dir, "nodes.db"));
			old.exec(`
				CREATE TABLE nodes (
					uuid TEXT PRIMARY KEY,
					fid TEXT GENERATED ALWAYS AS (json_extract(body, '$.fid')) STORED,
					title TEXT GENERATED ALWAYS AS (json_extract(body, '$.title')) STORED,
					parent TEXT GENERATED ALWAYS AS (json_extract(body, '$.parent')) STORED,
					mimetype TEXT GENERATED ALWAYS AS (json_extract(body, '$.mimetype')) STORED,
					body JSON NOT NULL,
					embedding JSON,
					embedding_content_md TEXT
				);
			`);
			for (const [uuid, embedding] of [["with-vector", "[1,0]"], ["without-vector", null]]) {
				const node = FileNode.create({
					uuid: uuid as string,
					title: `${uuid}.pdf`,
					mimetype: "application/pdf",
					owner: "tester@antbox.io",
				}).right;
				old.prepare("INSERT INTO nodes (uuid, body, embedding) VALUES (?, ?, ?)").run(
					uuid as string,
					JSON.stringify(node.metadata),
					embedding,
				);
			}
			old.close();

			for (let run = 0; run < 2; run++) {
				const repo = new SqliteNodeRepository(dir);
				try {
					const statuses = (await repo.getEmbeddingStatuses(["with-vector", "without-vector"]))
						.right;
					expect(statuses["with-vector"].status).toBe("indexed");
					expect(statuses["without-vector"].status).toBeNull();
					const counts = (await repo.countEmbeddingStatuses()).right;
					expect(counts).toEqual({ indexed: 1, failed: 0, skipped: 0, pending: 1 });
				} finally {
					repo.close();
				}
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("SqliteNodeRepository", () => {
	it("treats filter fields as data, including quotes in property names", async () => {
		const repo = new SqliteNodeRepository();
		try {
			await repo.add(
				FileNode.create({
					uuid: "quoted_property",
					title: "Invoice.pdf",
					mimetype: "application/pdf",
					owner: "tester@antbox.io",
					properties: { "finance:owner's-code": ["paid", "approved"] },
				}).right,
			);

			const injected = await repo.filter([[
				"title') OR 1=1 OR json_extract(body, '$.absent",
				"==",
				"missing",
			]]);
			expect(injected.nodes).toHaveLength(0);

			const matching = await repo.filter([
				["finance:owner's-code", "contains-all", ["paid", "approved"]],
				["title", "==", "Invoice.pdf"],
			]);
			expect(matching.nodes.map((node) => node.uuid)).toEqual(["quoted_property"]);

			const missing = await repo.filter([
				["finance:owner's-code", "contains-any", ["missing", "absent"]],
			]);
			expect(missing.nodes).toHaveLength(0);
		} finally {
			repo.close();
		}
	});

	describe("array contains filters", () => {
		it("matches string values inside aspects arrays", async () => {
			const repo = new SqliteNodeRepository();

			const invoice = FileNode.create({
				uuid: "sqlite_aspects_invoice",
				title: "Invoice.pdf",
				mimetype: "application/pdf",
				owner: "tester@antbox.io",
				group: "testers",
				aspects: ["finance", "invoice"],
			}).right;

			const contract = FileNode.create({
				uuid: "sqlite_aspects_contract",
				title: "Contract.pdf",
				mimetype: "application/pdf",
				owner: "tester@antbox.io",
				group: "testers",
				aspects: ["legal", "contract"],
			}).right;

			await repo.add(invoice);
			await repo.add(contract);

			const finance = await repo.filter([["aspects", "contains", "finance"]]);
			expect(finance.nodes).toHaveLength(1);
			expect(finance.nodes[0].uuid).toBe("sqlite_aspects_invoice");

			const any = await repo.filter([["aspects", "contains-any", ["finance", "legal"]]]);
			expect(any.nodes).toHaveLength(2);

			const all = await repo.filter([["aspects", "contains-all", ["finance", "invoice"]]]);
			expect(all.nodes).toHaveLength(1);
			expect(all.nodes[0].uuid).toBe("sqlite_aspects_invoice");

			const none = await repo.filter([["aspects", "contains-none", ["finance"]]]);
			expect(none.nodes).toHaveLength(1);
			expect(none.nodes[0].uuid).toBe("sqlite_aspects_contract");

			repo.close();
		});
	});
});
