// deno-lint-ignore-file no-explicit-any

import {
  isAnyNodeFilter,
  type NodeFilter,
  type NodeFilters1D,
  type NodeFilters2D,
} from "./node_filter.ts";
import type { FilterOperator, NodeFilters } from "./node_filter.ts";
import type { NodeLike } from "./node_like.ts";

export interface FiltersSpecification {
  isSatisfiedBy(node: NodeLike): boolean;
}

export function areFiltersSatisfiedBy(f: NodeFilters, n: NodeLike): boolean {
  return buildNodeSpecification(f)(n);
}

export function buildNodeSpecification(filters: NodeFilters): (n: NodeLike) => boolean {
  if (isAnyNodeFilter(filters)) {
    return processOrNodeFilters(filters);
  }

  return processNodeFilters(filters);
}

function processNodeFilters(filters: NodeFilters1D): (n: NodeLike) => boolean {
  if (filters.length === 0) {
    return (n: NodeLike) => true;
  }

  const predicates = filters.map(nodeFilterToPredicate);
  return (n: NodeLike) => predicates.every((p) => p(n));
}

function processOrNodeFilters(filters: NodeFilters2D): (n: NodeLike) => boolean {
  const predicates = filters.map((f) => buildNodeSpecification(f));
  return (n: NodeLike) => predicates.some((p) => p(n));
}

function nodeFilterToPredicate(filter: NodeFilter): (n: NodeLike) => boolean {
  const [field, operator, target] = filter;
  const satisfiesFn = filterFns[operator];

  return (node) => {
    const fieldValue = getFieldValue(node, field);

    return satisfiesFn(fieldValue, target);
  };
}

function getFieldValue(node: NodeLike, fieldPath: string): unknown {
  const fields = fieldPath.split(".");

  let acc: Record<string, unknown> | NodeLike = node;

  for (const field of fields) {
    acc = (acc as Record<string, unknown>)?.[field] as Record<string, unknown>;
  }

  return acc;
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

  contains: (a, b) => a?.includes(b),
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
