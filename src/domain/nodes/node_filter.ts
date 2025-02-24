export type NodeFilter = [
  field: string,
  operator: FilterOperator,
  value: unknown,
];

export type AndNodeFilters = NodeFilter[];
export type OrNodeFilters = AndNodeFilters[];

export type FilterOperator =
  | "=="
  | "<="
  | ">="
  | "<"
  | ">"
  | "!="
  | "in"
  | "not-in"
  | "match"
  | "contains"
  | "contains-all"
  | "contains-any"
  | "not-contains"
  | "contains-none";

export function isOrNodeFilter(
  filters: AndNodeFilters | OrNodeFilters,
): filters is OrNodeFilters {
  if (filters.length === 0) {
    return false;
  }

  return Array.isArray(filters[0][0]);
}
