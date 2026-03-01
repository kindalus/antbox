import { describe, it } from "bdd";
import { expect } from "expect";
import { DeterministicEmbeddingsProvider } from "./deterministic_embeddings_provider.ts";

describe("DeterministicEmbeddingsProvider", () => {
	const provider = new DeterministicEmbeddingsProvider(128);

	it("returns embeddings for each text", async () => {
		const result = await provider.embed(["hello", "world"]);
		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value).toHaveLength(2);
		}
	});

	it("returns vector of correct dimension", async () => {
		const result = await provider.embed(["hello"]);
		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value[0]).toHaveLength(128);
		}
	});

	it("returns same vector for same input (deterministic)", async () => {
		const r1 = await provider.embed(["hello"]);
		const r2 = await provider.embed(["hello"]);
		expect(r1.isRight()).toBe(true);
		expect(r2.isRight()).toBe(true);
		if (r1.isRight() && r2.isRight()) {
			expect(r1.value[0]).toEqual(r2.value[0]);
		}
	});

	it("returns different vectors for different inputs", async () => {
		const r1 = await provider.embed(["hello"]);
		const r2 = await provider.embed(["world"]);
		expect(r1.isRight()).toBe(true);
		expect(r2.isRight()).toBe(true);
		if (r1.isRight() && r2.isRight()) {
			expect(r1.value[0]).not.toEqual(r2.value[0]);
		}
	});

	it("returns unit-length vectors (normalized)", async () => {
		const result = await provider.embed(["normalize me"]);
		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			const vector = result.value[0];
			const magnitude = Math.sqrt(vector.reduce((sum: number, v: number) => sum + v * v, 0));
			expect(magnitude).toBeCloseTo(1.0, 5);
		}
	});

	it("handles empty text array", async () => {
		const result = await provider.embed([]);
		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value).toHaveLength(0);
		}
	});

	it("uses default dimension of 1536", async () => {
		const defaultProvider = new DeterministicEmbeddingsProvider();
		const result = await defaultProvider.embed(["test"]);
		expect(result.isRight()).toBe(true);
		if (result.isRight()) {
			expect(result.value[0]).toHaveLength(1536);
		}
	});
});
