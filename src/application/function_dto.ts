import { NodeFilter } from "domain/nodes/node_filter.ts";
import { FunctionParameter } from "domain/functions/function_node.ts";

export interface FunctionDTO {
  id: string;
  name: string;
  description: string;
  exposeAction: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  filters: NodeFilter[];

  exposeExtension: boolean;
  exposeMCP: boolean;

  runAs?: string;
  groupsAllowed: string[];
  parameters: FunctionParameter[];

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
