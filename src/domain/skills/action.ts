import { type NodeFilter } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { SkillParameter } from "domain/skills/skill_node.ts";

export interface Action {
  uuid: string;
  title: string;
  description: string;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  runAs?: string;
  parameters: SkillParameter[];

  filters: NodeFilter[];
  groupsAllowed: string[];
}

export function actionToNodeMetadata(
  action: Action,
  owner?: string,
): Partial<NodeMetadata> {
  return {
    uuid: action.uuid,
    title: action.title,
    description: action.description,
    runOnCreates: action.runOnCreates,
    runOnUpdates: action.runOnUpdates,
    runManually: action.runManually,
    runAs: action.runAs,
    params: action.params,
    filters: action.filters,
    groupsAllowed: action.groupsAllowed,
    mimetype: Nodes.ACTION_MIMETYPE,
    owner: owner || undefined,
  };
}
