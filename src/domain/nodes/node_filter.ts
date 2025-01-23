export type NodeFilter = [
  field: string,
  operator: FilterOperator,
  value: unknown,
];

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
