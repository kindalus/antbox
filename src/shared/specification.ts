import { AntboxError } from "./antbox_error.ts";
import { Either, left, right } from "./either.ts";
import { ValidationError } from "./validation_error.ts";

export type ValidationResult = Either<ValidationError, true>;

export interface Specification<T> {
	isSatisfiedBy(candidate: T): ValidationResult;

	and(spec: Specification<T>): Specification<T>;
	or(spec: Specification<T>): Specification<T>;
	not(): Specification<T>;
	andNot(spec: Specification<T>): Specification<T>;
	orNot(spec: Specification<T>): Specification<T>;
}

export class CompositeSpecification<T> implements Specification<T> {
	constructor(readonly isSatisfiedBy: (c: T) => ValidationResult = (_v) => right(true)) {}

	and(s: Specification<T>, ...specs: Specification<T>[]): Specification<T> {
		return andSpecification<T>(this, s, ...specs);
	}

	or(...specs: Specification<T>[]): Specification<T> {
		return orSpecification<T>(this, ...specs);
	}

	not(): Specification<T> {
		return notSpecification<T>(this);
	}

	andNot(spec: Specification<T>): Specification<T> {
		return andNotSpecification<T>(this, spec);
	}

	orNot(spec: Specification<T>): Specification<T> {
		return orNotSpecification<T>(this, spec);
	}
}

export function andSpecification<T>(
	s1: Specification<T>,
	s2: Specification<T>,
	...s: Specification<T>[]
): CompositeSpecification<T> {
	return new CompositeSpecification((candidate: T) => {
		const errors = [s1, s2, ...s]
			.map((spec) => spec.isSatisfiedBy(candidate))
			.filter((r) => r.isLeft())
			.map((r) => r.value)
			.reduce(
				(acc, err) => [...acc, ...(err as ValidationError).errors],
				[] as AntboxError[],
			);

		if (errors.length > 0) {
			return left(ValidationError.from(...errors));
		}

		return right(true);
	});
}

export function orSpecification<T>(...specs: Specification<T>[]): CompositeSpecification<T> {
	return new CompositeSpecification((candidate: T) => {
		const errors = specs
			.map((spec) => spec.isSatisfiedBy(candidate))
			.filter((r) => r.isLeft())
			.map((r) => r.value)
			.reduce(
				(acc, err) => [...acc, ...(err as ValidationError).errors],
				[] as AntboxError[],
			);

		if (errors.length === specs.length) {
			return left(ValidationError.from(...errors));
		}

		return right(true);
	});
}

export function notSpecification<T>(spec: Specification<T>): CompositeSpecification<T> {
	return new CompositeSpecification((candidate: T) => {
		const result = spec.isSatisfiedBy(candidate);
		if (result.isLeft()) {
			return right(true);
		}

		return left(ValidationError.from(new SpecificationError()));
	});
}

export function andNotSpecification<T>(
	spec: Specification<T>,
	notSpec: Specification<T>,
): CompositeSpecification<T> {
	return new CompositeSpecification((candidate: T) => {
		const result = spec.isSatisfiedBy(candidate);
		if (result.isLeft()) {
			return result;
		}

		const notResult = notSpec.isSatisfiedBy(candidate);
		if (notResult.isLeft()) {
			return right(true);
		}

		return left(ValidationError.from(new SpecificationError()));
	});
}

export function orNotSpecification<T>(
	spec: Specification<T>,
	notSpec: Specification<T>,
): CompositeSpecification<T> {
	return new CompositeSpecification((candidate: T) => {
		const result = spec.isSatisfiedBy(candidate);
		if (result.isLeft()) {
			const notResult = notSpec.isSatisfiedBy(candidate);
			if (notResult.isLeft()) {
				return result;
			}

			return right(true);
		}

		return result;
	});
}

export function specFn<T>(
	fn: (candidate: T) => ValidationResult,
): Specification<T> {
	return new CompositeSpecification<T>(fn);
}

export class SpecificationError extends AntboxError {
	static readonly ERROR_CODE = "Specification";
	constructor() {
		super("not", "The candidate is not valid");
	}
}
