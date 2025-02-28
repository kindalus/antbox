export type NodeFilter = [field: string, operator: FilterOperator, value: unknown];

export type AllNodeFilters = NodeFilter[];
export type AnyNodeFilters = AllNodeFilters[];
export type NodeFilters = AllNodeFilters | AnyNodeFilters;

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

export function isAnyNodeFilter(filters: NodeFilters): filters is AnyNodeFilters {
  if (filters.length === 0) {
    return false;
  }

  return Array.isArray(filters[0][0]);
}
