import { describe, it } from "bdd";
import { expect } from "expect";
import {
	fulltextMatches,
	fulltextOf,
	fulltextQuery,
	fulltextTerms,
	isFulltextFilter,
} from "./fulltext.ts";

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

describe("fulltextMatches", () => {
	it("finds the cleaned words in order, ignoring accents, case and short words", () => {
		const texts = ["Relatório de Acção", "factura de venda"];
		expect(fulltextMatches("acção relatorio", texts)).toBe(false);
		expect(fulltextMatches("RELATORIO accao", texts)).toBe(true);
		expect(fulltextMatches("fact vend", texts)).toBe(true);
		expect(fulltextMatches("ac", texts)).toBe(true);
		expect(fulltextMatches("de", texts)).toBe(false);
		expect(fulltextMatches("compra", texts)).toBe(false);
	});

	it("matches nothing for a query without words", () => {
		for (const query of ["", "  ", "%_", '"*:&|!()-']) {
			expect(fulltextMatches(query, ["anything at all"])).toBe(false);
		}
	});
});

describe("fulltextTerms", () => {
	it("keeps letters, numbers and marks and drops every operator", () => {
		expect(fulltextTerms('"fact*" & (venda | -2024): ação!')).toEqual([
			"fact",
			"venda",
			"2024",
			"ação",
		]);
		expect(fulltextTerms('" * : & | ! ( ) -')).toEqual([]);
		expect(fulltextTerms("́ á")).toEqual(["á"]);
	});
});

describe("isFulltextFilter", () => {
	it("recognizes only fulltext match filters", () => {
		expect(isFulltextFilter(["fulltext", "match", "x"])).toBe(true);
		expect(isFulltextFilter(["title", "match", "x"])).toBe(false);
		expect(isFulltextFilter(["fulltext", "==", "x"])).toBe(false);
	});
});
