import { describe, it } from "bdd";
import { expect } from "expect";
import { applyRelevanceThreshold, relaxedThreshold } from "./relevance_threshold.ts";

const results = (...scores: number[]) => scores.map((score, i) => ({ id: `n${i}`, score }));

describe("applyRelevanceThreshold", () => {
	it("keeps the provider threshold when the best result passes it", () => {
		const outcome = applyRelevanceThreshold(results(0.8, 0.65, 0.55), 0.6);
		expect(outcome.threshold).toBe(0.6);
		expect(outcome.results.map((r) => r.score)).toEqual([0.8, 0.65]);
	});

	it("lowers the threshold by 10 points once when nothing passes", () => {
		const outcome = applyRelevanceThreshold(results(0.55, 0.52, 0.45), 0.6);
		expect(outcome.threshold).toBe(0.5);
		expect(outcome.results.map((r) => r.score)).toEqual([0.55, 0.52]);
	});

	it("returns nothing when nothing passes the lowered threshold", () => {
		const outcome = applyRelevanceThreshold(results(0.49, 0.3), 0.6);
		expect(outcome.results).toEqual([]);
	});

	it("returns nothing for no candidates", () => {
		expect(applyRelevanceThreshold([], 0.6).results).toEqual([]);
	});

	it("subtracts exactly 0.1 and never goes below zero", () => {
		expect(relaxedThreshold(0.6)).toBe(0.5);
		expect(relaxedThreshold(0.7)).toBe(0.6);
		expect(relaxedThreshold(0.05)).toBe(0);
	});
});
