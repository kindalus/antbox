import { describe, it } from "bdd";
import { expect } from "expect";
import { FileNode } from "domain/nodes/file_node.ts";
import { SqliteNodeRepository } from "./sqlite_node_repository.ts";

describe("SqliteNodeRepository", () => {
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
