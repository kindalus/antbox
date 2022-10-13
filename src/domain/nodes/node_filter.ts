export type NodeFilter = [
  field: string,
  operator: FilterOperator,
  value: unknown
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
  | "array-contains"
  | "match";
