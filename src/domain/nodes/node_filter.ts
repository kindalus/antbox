export type NodeFilter = [field: string, operator: FilterOperator, value: unknown];

export type NodeFilters1D = NodeFilter[];
export type NodeFilters2D = NodeFilters1D[];
export type NodeFilters = NodeFilters1D | NodeFilters2D;

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

export function isAnyNodeFilter(filters: NodeFilters): filters is NodeFilters2D {
  if (filters.length === 0) {
    return false;
  }

  return Array.isArray(filters[0][0]);
}
