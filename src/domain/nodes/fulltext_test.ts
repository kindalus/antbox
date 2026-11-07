import { describe, it } from "bdd";
import { expect } from "expect";
import { fulltextOf, fulltextQuery, withFulltextQueries } from "./fulltext.ts";

describe("fulltextOf", () => {
	it("lowercases, removes accents and punctuation, and drops repeated words", () => {
		expect(fulltextOf(["Acção disciplinar", "RELATÓRIO-final_2024; acção"])).toBe(
			"accao disciplinar relatorio final 2024",
		);
	});

	it("drops consecutive short words and a short last word", () => {
		expect(fulltextOf(["Plano a de obra", "nº 12"])).toBe("plano obra");
	});
});

describe("fulltextQuery", () => {
	it("cleans the query like the stored text", () => {
		expect(fulltextQuery("Factura de venda")).toBe("factura venda");
		expect(fulltextQuery("nº 123/2024")).toBe("123 2024");
	});

	it("keeps short words when nothing else is left", () => {
		expect(fulltextQuery("Fa")).toBe("fa");
		expect(fulltextQuery("nº 12")).toBe("n 12");
	});

	it("returns a query without words unchanged", () => {
		expect(fulltextQuery("%_")).toBe("%_");
		expect(fulltextQuery("  ")).toBe("  ");
	});

	it("is idempotent", () => {
		for (const query of ["Acção de venda", "a de", "%_", "nº 12"]) {
			expect(fulltextQuery(fulltextQuery(query))).toBe(fulltextQuery(query));
		}
	});
});

describe("withFulltextQueries", () => {
	it("changes only fulltext match filters", () => {
		expect(
			withFulltextQueries([[
				["fulltext", "match", "Acção"],
				["title", "match", "Acção"],
				["fulltext", "==", "Acção"],
			]]),
		).toEqual([[
			["fulltext", "match", "accao"],
			["title", "match", "Acção"],
			["fulltext", "==", "Acção"],
		]]);
	});
});
