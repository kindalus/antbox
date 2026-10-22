import { describe, it } from "bdd";
import { expect } from "expect";
import { AntboxError } from "./antbox_error.ts";
import { left, right } from "./either.ts";
import { orSpecification, specificationFn } from "./specification.ts";
import { ValidationError } from "./validation_error.ts";

const failure = (message: string) => new AntboxError("Test", message);
const specification = (valid: boolean, errors = [failure("Invalid")]) =>
	specificationFn<unknown>(() => valid ? right(true) : left(ValidationError.from(...errors)));

describe("Specification composition", () => {
	it("follows boolean truth tables for conjunction, disjunction, and negation", () => {
		for (const a of [true, false]) {
			const first = specification(a);
			expect(first.not().isSatisfiedBy(null).isRight()).toBe(!a);
			for (const b of [true, false]) {
				const second = specification(b);
				expect(first.and(second).isSatisfiedBy(null).isRight()).toBe(a && b);
				expect(first.or(second).isSatisfiedBy(null).isRight()).toBe(a || b);
				expect(first.andNot(second).isSatisfiedBy(null).isRight()).toBe(a && !b);
				expect(first.orNot(second).isSatisfiedBy(null).isRight()).toBe(a || !b);
			}
		}
	});

	it("bases OR on passing specifications regardless of nested error counts", () => {
		const errors = [failure("Required"), failure("Wrong type")];
		const rejected = specification(false, errors);
		const allRejected = rejected.or(rejected).isSatisfiedBy(null);
		expect(allRejected.isLeft()).toBe(true);
		expect((allRejected.value as ValidationError).errors).toEqual([...errors, ...errors]);
		expect(rejected.or(specification(true)).isSatisfiedBy(null).isRight()).toBe(true);
		expect(specification(true).or(rejected).isSatisfiedBy(null).isRight()).toBe(true);
		expect(orSpecification().isSatisfiedBy(null).isLeft()).toBe(true);
	});

	it("keeps empty validation failures and their messages in AND and OR", () => {
		const emptyError = new ValidationError("Aspect not found", []);
		const missing = specificationFn<unknown>(() => left(emptyError));
		const rejected = missing.and(specification(true)).isSatisfiedBy(null);
		expect(rejected.isLeft()).toBe(true);
		expect((rejected.value as ValidationError).errors).toEqual([emptyError]);
		expect((rejected.value as ValidationError).message).toContain("Aspect not found");
		const disjunction = missing.or(missing).isSatisfiedBy(null);
		expect(disjunction.isLeft()).toBe(true);
		expect((disjunction.value as ValidationError).errors).toEqual([emptyError, emptyError]);
	});

	it("preserves all AND diagnostics and the original failed OR NOT branch", () => {
		const errors = [failure("Required"), failure("Wrong type")];
		const result = specification(false, errors).and(specification(false, errors))
			.isSatisfiedBy(null);
		expect((result.value as ValidationError).errors).toEqual([...errors, ...errors]);
		const original = left<ValidationError, true>(ValidationError.from(...errors));
		const rejected = specificationFn<unknown>(() => original);
		expect(rejected.orNot(specification(true)).isSatisfiedBy(null)).toBe(original);
	});
});
