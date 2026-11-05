import { describe, it } from "bdd";
import { expect } from "expect";
import { geminiUsageToTokenUsage } from "./gemini_ocr_provider.ts";

describe("geminiUsageToTokenUsage", () => {
	it("counts thinking tokens as completion tokens", () => {
		expect(geminiUsageToTokenUsage({
			promptTokenCount: 100,
			candidatesTokenCount: 20,
			thoughtsTokenCount: 5,
			totalTokenCount: 125,
		})).toEqual({ promptTokens: 100, completionTokens: 25, totalTokens: 125 });
	});

	it("derives the total when the provider omits it", () => {
		expect(geminiUsageToTokenUsage({ promptTokenCount: 100, candidatesTokenCount: 20 }))
			.toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120 });
	});

	it("returns undefined when the response has no usage metadata", () => {
		expect(geminiUsageToTokenUsage(undefined)).toBeUndefined();
	});
});
