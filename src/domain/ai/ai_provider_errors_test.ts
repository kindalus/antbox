import { describe, it } from "bdd";
import { expect } from "expect";
import { ApiError } from "@google/genai";
import { aiErrorFrom, TransientAIError } from "./ai_provider_errors.ts";

describe("aiErrorFrom", () => {
	for (const status of [408, 429, 500, 502, 503, 504]) {
		it(`treats HTTP ${status} as transient`, () => {
			const error = aiErrorFrom(new ApiError({ message: "x", status }), "GeminiError", "failed");
			expect(error).toBeInstanceOf(TransientAIError);
		});
	}

	it("treats network failures and timeouts as transient", () => {
		expect(aiErrorFrom(new TypeError("fetch failed"), "GeminiError", "failed")).toBeInstanceOf(
			TransientAIError,
		);
		const timeout = new Error("The operation timed out");
		timeout.name = "TimeoutError";
		expect(aiErrorFrom(timeout, "GeminiError", "failed")).toBeInstanceOf(TransientAIError);
		const reset = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
		expect(aiErrorFrom(reset, "GeminiError", "failed")).toBeInstanceOf(TransientAIError);
	});

	it("keeps other errors permanent with the given code", () => {
		const error = aiErrorFrom(
			new ApiError({ message: "bad", status: 400 }),
			"GeminiError",
			"bad",
		);
		expect(error).not.toBeInstanceOf(TransientAIError);
		expect(error.errorCode).toBe("GeminiError");
		expect(error.message).toContain("bad");
	});
});
