import { left, right } from "shared/either.ts";
import type { NodeLike } from "./node_like.ts";
import {
	type Specification,
	specificationFn,
	type ValidationResult,
} from "shared/specification.ts";
import { ValidationError } from "shared/validation_error.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { isNodeFilters2D } from "./nodes/node_filter.ts";

import type {
	FilterOperator,
	NodeFilter,
	NodeFilters,
	NodeFilters2D,
} from "./nodes/node_filter.ts";

export class NodesFilters {
	static satisfiedBy(f: NodeFilters, n: NodeLike): ValidationResult {
		const spec = NodesFilters.nodeSpecificationFrom(f);
		return spec.isSatisfiedBy(n);
	}

	static nodeSpecificationFrom(filters: NodeFilters): Specification<NodeLike> {
		if (!filters || !filters.length) return specificationFn(() => right(true));

		const isSatisfiedByFn = isNodeFilters2D(filters)
			? NodesFilters.#processNodeFilters(filters)
			: NodesFilters.#processNodeFilters([filters]);

		return specificationFn((n) => {
			const result = isSatisfiedByFn(n);

			if (result) {
				return right(true);
			}

			return left(
				ValidationError.from(
					new BadRequestError("Node doesn't satisfy filters"),
				),
			);
		});
	}

	static #processNodeFilters(filters: NodeFilters2D): (n: NodeLike) => boolean {
		const predicates = filters.map((f) => {
			if (f.length === 0) {
				return () => true;
			}

			const predicates = f.map(NodesFilters.#nodeFilterToPredicate);
			return (n: NodeLike) => predicates.every((p) => p(n));
		});

		return (n: NodeLike) => predicates.some((p) => p(n));
	}

	static #nodeFilterToPredicate(filter: NodeFilter): (n: NodeLike) => boolean {
		const [field, operator, target] = filter;
		const satisfiesFn = filterFns[operator];

		return (node) => {
			const fieldValue = NodesFilters.#getFieldValue(node, field);

			return satisfiesFn(fieldValue, target);
		};
	}

	static #getFieldValue(node: NodeLike, fieldPath: string): unknown {
		const fields = fieldPath.split(".");

		let acc: Record<string, unknown> | NodeLike = node;

		for (const field of fields) {
			acc = (acc as Record<string, unknown>)?.[field] as Record<
				string,
				unknown
			>;
		}

		return acc;
	}

	private constructor(public filters: NodeFilters2D) {}
}

type FilterFn = <T>(a: T, b: T) => boolean;

const filterFns: Record<FilterOperator, FilterFn> = {
	"~=": (_a, _b) => true,
	"==": (a, b) => a === b,
	"<=": (a, b) => a <= b,
	">=": (a, b) => a >= b,
	"<": (a, b) => a < b,
	">": (a, b) => a > b,
	"!=": (a, b) => a !== b,

	in: <T>(a: T, b: T) => (b as T[])?.includes(a as never),
	"not-in": <T>(a: T, b: T) => !(b as T[])?.includes(a),

	contains: <T>(a: T, b: T) => (a as T[])?.includes(b) || false,
	"contains-all": <T>(a: T, b: T) => (b as T[])?.every((v) => (a as T[])?.includes(v)),

	"contains-any": <T>(a: T, b: T) => (b as T[])?.some((v) => (a as T[])?.includes(v)),

	"not-contains": <T>(a: T, b: T) => !(a as T[])?.includes(b),
	"contains-none": <T>(a: T, b: T) => !(b as T[])?.every((v) => (a as T[])?.includes(v)),

	match: (a, b) => {
		const a1 = a as unknown as string;
		const b1 = b as unknown as string;

		const re = new RegExp(b1.replaceAll(/\s/g, ".*?"), "i");
		const match = a1?.match(re);

		return match !== undefined && match !== null;
	},
};
