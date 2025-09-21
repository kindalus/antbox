import { NodeFilters } from "domain/nodes/node_filter.ts";
import { FeatureParameter } from "domain/features/feature_node.ts";

export interface FeatureDTO {
  id: string;
  name: string;
  description: string;
  exposeAction: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  filters: NodeFilters;

  exposeExtension: boolean;
  exposeAITool: boolean;

  runAs?: string;
  groupsAllowed: string[];
  parameters: FeatureParameter[];

  returnType:
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object"
    | "file"
    | "void";
  returnDescription?: string;
  returnContentType?: string;
}
