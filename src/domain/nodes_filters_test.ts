import { describe, it } from "bdd";
import { expect } from "expect";
import type { NodeLike } from "./node_like.ts";
import { NodesFilters } from "./nodes_filters.ts";

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

	it("handles contains filters on incompatible field values without throwing", () => {
		for (const value of [8, true, {}, null, undefined]) {
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
		for (const value of ["annual report", ["annual", "report"]]) {
			const node = { properties: { value } } as unknown as NodeLike;
			expect(
				NodesFilters.satisfiedBy([["properties.value", "contains", "report"]], node).isRight(),
			)
				.toBe(true);
		}
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
});
