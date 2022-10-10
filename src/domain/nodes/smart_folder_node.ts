import { Node } from "./node.ts";
import { NodeFilter } from "./node_filter.ts";

export const SMART_FOLDER_MIMETYPE = "application/smartfolder";
export interface SmartFolderNode extends Node {
  filters: NodeFilter[];
  aggregations?: Aggregation[];
}

export interface Aggregation {
  title: string;
  fieldName: string;
  formula: AggregationFormula;
}

export type AggregationFormula =
  | "sum"
  | "count"
  | "avg"
  | "med"
  | "max"
  | "min"
  | "string";