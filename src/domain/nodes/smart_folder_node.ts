import { Node } from "./node.ts";
import { NodeFilter } from "./node_filter.ts";

export class SmartFolderNode extends Node {
  filters: NodeFilter[] = [];
  aggregations?: Aggregation[];

  constructor() {
    super();
    this.mimetype = Node.SMART_FOLDER_MIMETYPE;
  }

  hasAggregations(): boolean {
    return (this.aggregations?.length ?? 0) > 0;
  }
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
