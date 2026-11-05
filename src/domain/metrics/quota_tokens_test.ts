import { describe, it } from "bdd";
import { expect } from "expect";
import { quotaTokens } from "./quota_tokens.ts";

describe("quotaTokens", () => {
	it("excludes cache reads and keeps cache writes", () => {
		expect(quotaTokens({
			promptTokens: 1_000,
			completionTokens: 50,
			totalTokens: 1_050,
			cacheReadTokens: 900,
			cacheWriteTokens: 80,
		})).toBe(150);
	});

	it("counts events recorded before the cache breakdown in full", () => {
		expect(quotaTokens({ promptTokens: 1_000, completionTokens: 50, totalTokens: 1_050 }))
			.toBe(1_050);
	});

	it("does not depend on the provider including cache in the total", () => {
		expect(quotaTokens({
			promptTokens: 100,
			completionTokens: 10,
			totalTokens: 20,
			cacheReadTokens: 90,
		})).toBe(20);
	});

	it("falls back to the total when the split is missing", () => {
		expect(quotaTokens({ totalTokens: 70 })).toBe(70);
	});

	it("counts nothing without usage", () => {
		expect(quotaTokens(undefined)).toBe(0);
	});
});
