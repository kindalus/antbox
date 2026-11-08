import { describe, it } from "bdd";
import { expect } from "expect";
import type { NodeLike } from "./node_like.ts";
import type { NodeFilter } from "./nodes/node_filter.ts";
import { NodesFilters, resolveSelfReferences } from "./nodes_filters.ts";

describe("NodesFilters", () => {
	it("does not coerce structured field values or operands into comparison and search strings", () => {
		const structured = { toString: null, valueOf: null };
		const node = { title: "123", properties: { value: structured } } as unknown as NodeLike;
		for (const operator of ["<", "<=", ">", ">="] as const) {
			expect(NodesFilters.satisfiedBy([["properties.value", operator, 3]], node).isLeft())
				.toBe(true);
			expect(NodesFilters.satisfiedBy([["title", operator, structured]], node).isLeft()).toBe(
				true,
			);
		}
		for (const operator of ["match", "contains"] as const) {
			expect(NodesFilters.satisfiedBy([["title", operator, structured]], node).isLeft()).toBe(
				true,
			);
		}
	});

	it("never satisfies fulltext match filters, which only searches support", () => {
		const node = { title: "Annual report", fulltext: "annual report" } as unknown as NodeLike;
		expect(NodesFilters.satisfiedBy([["fulltext", "match", "annual"]], node).isLeft()).toBe(true);
		expect(NodesFilters.satisfiedBy([["title", "match", "annual"]], node).isRight()).toBe(true);
	});

	it("handles contains filters on incompatible field values without throwing", () => {
		for (const value of [8, true, {}, null, undefined, "8", "a 8 b"]) {
			const node = { properties: { value } } as unknown as NodeLike;
			for (const operator of ["contains", "contains-all", "contains-any"] as const) {
				const target = operator === "contains" ? "8" : ["8"];
				expect(
					NodesFilters.satisfiedBy([["properties.value", operator, target]], node).isRight(),
				)
					.toBe(false);
			}
			for (const operator of ["not-contains", "contains-none"] as const) {
				const target = operator === "not-contains" ? "8" : ["8"];
				expect(
					NodesFilters.satisfiedBy([["properties.value", operator, target]], node).isRight(),
				)
					.toBe(true);
			}
		}
		for (
			const [value, expected] of [["annual report", false], [
				["annual", "report"],
				true,
			]] as const
		) {
			const node = { properties: { value } } as unknown as NodeLike;
			expect(
				NodesFilters.satisfiedBy([["properties.value", "contains", "report"]], node).isRight(),
			)
				.toBe(expected);
		}
	});

	it("applies the contains operators only to arrays", () => {
		const satisfied = (value: unknown, filter: [string, unknown]) =>
			NodesFilters.satisfiedBy(
				[["properties.value", filter[0], filter[1]]] as never,
				{ properties: { value } } as unknown as NodeLike,
			).isRight();

		for (const value of ["report", "annual report", 3, true, { report: 1 }, null, undefined]) {
			expect(satisfied(value, ["contains", "report"])).toBe(false);
			expect(satisfied(value, ["contains-all", ["report"]])).toBe(false);
			expect(satisfied(value, ["contains-all", []])).toBe(false);
			expect(satisfied(value, ["contains-any", ["report"]])).toBe(false);
			expect(satisfied(value, ["not-contains", "report"])).toBe(true);
			expect(satisfied(value, ["contains-none", ["report"]])).toBe(true);
			expect(satisfied(value, ["contains-none", []])).toBe(true);
		}

		expect(satisfied([], ["contains-all", []])).toBe(true);
		expect(satisfied(["report"], ["not-contains", "report"])).toBe(false);
	});

	it("contains-none rejects any overlap and accepts an empty exclusion list", () => {
		const node = { tags: ["finance", "document"] } as unknown as NodeLike;
		for (
			const [excluded, expected] of [
				[["finance", "legal"], false],
				[["finance", "document"], false],
				[["legal"], true],
				[[], true],
			] as const
		) {
			expect(NodesFilters.satisfiedBy([["tags", "contains-none", excluded]], node).isRight())
				.toBe(expected);
		}
	});

	it("matches literal search terms in order without interpreting regular expressions", () => {
		for (
			const [title, query, expected] of [
				["Annual detailed Revenue 2024", "annual revenue 2024", true],
				["Revenue annual 2024", "annual revenue", false],
				["Report [draft]", "[draft]", true],
				["Report d", "[draft]", false],
				["C++ guide", "C++", true],
				["aaaaaaaaaaaaaaaaaaaa!", "(a+)+$", false],
				["literal [", "[", true],
			] as const
		) {
			const node = { title } as NodeLike;
			expect(NodesFilters.satisfiedBy([["title", "match", query]], node).isRight())
				.toBe(expected);
		}
	});
});

describe("Node filter validation", () => {
	it("rejects malformed filter shapes and array operands without throwing", () => {
		for (
			const filters of [null, [null], [[4, "==", "x"]], [["title", "unknown", "x"]], [[
				"tags",
				"in",
				"finance",
			]]]
		) {
			const node = { title: "Example", tags: ["finance"] } as unknown as NodeLike;
			expect(NodesFilters.satisfiedBy(filters as never, node).isLeft()).toBe(true);
		}
	});

	it("treats an empty AND group as matching all nodes", () => {
		const node = { title: "Example" } as NodeLike;
		expect(NodesFilters.satisfiedBy([[]], node).isRight()).toBe(true);
		expect(NodesFilters.satisfiedBy([[], [["title", "==", "missing"]]], node).isRight()).toBe(
			true,
		);
	});

	it("parses the operator between the field and value, not words inside values", () => {
		for (const value of ["contains", "matching", "begin", "name>=2"]) {
			const result = NodesFilters.parse(`title == "${value}"`);
			expect(result.isRight()).toBe(true);
			expect(result.right).toEqual([[["title", "==", value]]]);
		}
		for (const text of ["begin again", "an invoice", "plain text"]) {
			expect(NodesFilters.parse(text).isLeft()).toBe(true);
		}
	});

	it("reads unquoted numbers as numbers only in range comparisons", () => {
		expect(NodesFilters.parse("size > 1000").right).toEqual([[["size", ">", 1000]]]);
		expect(NodesFilters.parse("size >= -2.5").right).toEqual([[["size", ">=", -2.5]]]);
		expect(NodesFilters.parse("size < 10, size <= 20").right).toEqual([[
			["size", "<", 10],
			["size", "<=", 20],
		]]);
		expect(NodesFilters.parse('size > "1000"').right).toEqual([[["size", ">", "1000"]]]);
		expect(NodesFilters.parse("createdTime >= 2026-06-03").right).toEqual([[
			["createdTime", ">=", "2026-06-03"],
		]]);
		expect(NodesFilters.parse("nif:number == 5002568772").right).toEqual([[
			["nif:number", "==", "5002568772"],
		]]);
	});

	it("reads ${field} values as references, also for array operators", () => {
		expect(NodesFilters.parse("process:date <= ${invoice:date}").right).toEqual([[
			["process:date", "<=", "${invoice:date}"],
		]]);
		expect(NodesFilters.parse("uuid in ${invoice:processes}").right).toEqual([[
			["uuid", "in", "${invoice:processes}"],
		]]);
		expect(NodesFilters.parse("uuid in ${@aspects}").isLeft()).toBe(true);
	});
});

describe("resolveSelfReferences", () => {
	const self = {
		uuid: "self-1",
		title: "Invoice",
		properties: {
			"invoice:date": "2026-08-12",
			"invoice:amount": 100,
			"invoice:processes": ["p-1", "p-2"],
			"invoice:note": "",
		},
	} as unknown as NodeLike;
	const never: NodeFilter = ["uuid", "in", []];

	it("replaces each ${field} value with the typed value read from the node being written", () => {
		expect(resolveSelfReferences([
			["process:date", "<=", "${invoice:date}"],
			["process:amount", ">=", "${invoice:amount}"],
			["uuid", "in", "${invoice:processes}"],
			["title", "!=", "${title}"],
			["title", "==", "FT-${title}"],
		], self)).toEqual([
			["process:date", "<=", "2026-08-12"],
			["process:amount", ">=", 100],
			["uuid", "in", ["p-1", "p-2"]],
			["title", "!=", "Invoice"],
			["title", "==", "FT-${title}"],
		]);
		expect(
			resolveSelfReferences([[["title", "==", "${title}"]], [["uuid", "==", "${uuid}"]]], self),
		)
			.toEqual([[["title", "==", "Invoice"]], [["uuid", "==", "self-1"]]]);
	});

	it("makes a condition fail when its field has no value or an array operator gets no array", () => {
		for (const field of ["invoice:missing", "invoice:note", "description"]) {
			expect(resolveSelfReferences([["title", "!=", `\${${field}}`]], self)).toEqual([never]);
		}
		expect(resolveSelfReferences([["uuid", "in", "${invoice:date}"]], self)).toEqual([never]);

		const node = { uuid: "other", title: "Invoice" } as unknown as NodeLike;
		const filters = resolveSelfReferences([[["title", "!=", "${description}"]], [[
			"title",
			"==",
			"Invoice",
		]]], self);
		expect(NodesFilters.satisfiedBy(filters, node).isRight()).toBe(true);
		expect(NodesFilters.satisfiedBy([filters[0]] as typeof filters, node).isLeft()).toBe(true);
	});
});
