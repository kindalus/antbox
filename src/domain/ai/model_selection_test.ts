import { describe, it } from "bdd";
import { expect } from "expect";
import { modelName, ModelSelectionSchema, thinkingLevel } from "./model_selection.ts";

describe("ModelSelection", () => {
	it("normalizes legacy strings and defaults thinking to off", () => {
		const selection = ModelSelectionSchema.parse("google/gemini-flash-latest");
		expect(selection).toEqual(["google/gemini-flash-latest"]);
		expect(modelName(selection)).toBe("google/gemini-flash-latest");
		expect(thinkingLevel(selection)).toBe("off");
	});

	it("preserves an explicit Pi thinking level", () => {
		const selection = ModelSelectionSchema.parse([
			"google/gemini-flash-latest",
			"medium",
		]);
		expect(thinkingLevel(selection)).toBe("medium");
	});

	it("rejects invalid selections", () => {
		for (const selection of [[], ["model", "invalid"], ["model", "off", "extra"]]) {
			expect(() => ModelSelectionSchema.parse(selection)).toThrow();
		}
	});
});
