import { NodeFilter } from "domain/nodes/node_filter.ts";
import { SkillParameter } from "domain/skills/skill_node.ts";

export interface SkillDTO {
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
  parameters: SkillParameter[];

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
