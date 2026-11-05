import { describe, it } from "bdd";
import { expect } from "expect";
import { tokenCountOrEstimate } from "./gemini_embeddings_provider.ts";

describe("tokenCountOrEstimate", () => {
	it("uses the count reported by the provider", () => {
		expect(tokenCountOrEstimate(7, "a".repeat(100), "gemini-embedding-2")).toBe(7);
	});

	it("estimates one token per four characters when the count failed", () => {
		expect(tokenCountOrEstimate(undefined, "a".repeat(10), "gemini-embedding-2")).toBe(3);
	});

	it("estimates when the provider reports zero tokens for non-empty text", () => {
		expect(tokenCountOrEstimate(0, "a".repeat(8), "gemini-embedding-2")).toBe(2);
	});
});
