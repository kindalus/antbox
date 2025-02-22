// deno-lint-ignore-file no-explicit-any

import { Node } from "./node.ts";
import type { NodeFilter } from "./node_filter.ts";
import type { FilterOperator } from "./node_filter.ts";

export interface FilersSpecification {
  isSatisfiedBy(node: Node): boolean;
}

export function specificationFrom(
  filters: NodeFilter[] = [],
): FilersSpecification {
  const predicates = filters.map(nodeFilterToPredicate);
  return { isSatisfiedBy: (node) => predicates.every((p) => p(node)) };
}

export function withNodeFilters(filters: NodeFilter[]): (n: Node) => boolean {
  const spec = specificationFrom(filters);
  return (n: Node) => spec.isSatisfiedBy(n);
}

function nodeFilterToPredicate(filter: NodeFilter): (n: Node) => boolean {
  const [field, operator, target] = filter;
  const satisfiesFn = filterFns[operator];

  return (node) => {
    const fieldValue = getFieldValue(node, field);
    return satisfiesFn(fieldValue, target);
  };
}

function getFieldValue(node: Node, fieldPath: string): unknown {
  const fields = fieldPath.split(".");

  let acc: Record<string, unknown> = { ...node };

  for (const field of fields) {
    acc = acc?.[field] as Record<string, unknown>;
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
