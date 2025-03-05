import { left, right } from "shared/either.ts";
import type { NodeLike } from "./node_like.ts";
import {
  specificationFn,
  type Specification,
  type ValidationResult,
} from "shared/specification.ts";
import { ValidationError } from "shared/validation_error.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { isNodeFilters2D } from "./nodes/node_filter.ts";

import type {
  NodeFilters2D,
  FilterOperator,
  NodeFilters,
  NodeFilter,
} from "./nodes/node_filter.ts";

export class NodesFilters {
  static satisfiedBy(f: NodeFilters, n: NodeLike): ValidationResult {
    const spec = NodesFilters.nodeSpecificationFrom(f);
    return spec.isSatisfiedBy(n);
  }

  static nodeSpecificationFrom(filters: NodeFilters): Specification<NodeLike> {
    const isSatisfiedByFn = isNodeFilters2D(filters)
      ? NodesFilters.#processNodeFilters(filters)
      : NodesFilters.#processNodeFilters([filters]);

    return specificationFn((n) => {
      const result = isSatisfiedByFn(n);

      if (result) {
        return right(true);
      }

      return left(ValidationError.from(new BadRequestError("Node doesn't satisfy filters")));
    });
  }

  static #processNodeFilters(filters: NodeFilters2D): (n: NodeLike) => boolean {
    const predicates = filters.map((f) => {
      if (f.length === 0) {
        return (n: NodeLike) => true;
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
      acc = (acc as Record<string, unknown>)?.[field] as Record<string, unknown>;
    }

    return acc;
  }

  private constructor(public filters: NodeFilters2D) {}
}

type FilterFn = (a: any, b: any) => boolean;

const filterFns: Record<FilterOperator, FilterFn> = {
  "==": (a, b) => a === b,
  "<=": (a, b) => a <= b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  ">": (a, b) => a > b,
  "!=": (a, b) => a !== b,

  in: (a, b) => (b as [])?.includes(a as never),
  "not-in": <T>(a: T, b: T[]) => !(b as unknown as T[])?.includes(a),

  contains: (a, b) => a?.includes(b) || false,
  "contains-all": (a, b) => b?.every((item: any) => a?.includes(item)),
  "contains-any": (a, b) => b?.some((item: any) => a?.includes(item)),
  "not-contains": (a, b) => !a?.includes(b),
  "contains-none": (a, b) => !b?.every((item: any) => a?.includes(item)),

  match: (a, b) => {
    const a1 = a as unknown as string;
    const b1 = b as unknown as string;

    const re = new RegExp(b1.replaceAll(/\s/g, ".*?"), "i");
    const match = a1?.match(re);

    return match !== undefined && match !== null;
  },
};
