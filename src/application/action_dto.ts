import type { ActionNode } from "domain/actions/action_node";
import type { NodeFilters } from "domain/nodes/node_filter";

export interface ActionDTO {
    uuid: string;
    title: string;
    description: string;
    builtIn: boolean;
    runOnCreates: boolean;
    runOnUpdates: boolean;
    runManually: boolean;
    runAs?: string;
    params: string[];
    filters: NodeFilters;
    groupsAllowed: string[];
  }
  
  export function nodeToAction(metadata: Partial<ActionNode>): ActionDTO {
    return {
      uuid: metadata.uuid!,
      title: metadata.title!,
      description: metadata.description!,
      builtIn: metadata.builtIn,
      runOnCreates: metadata.runOnCreates!,
      runOnUpdates: metadata.runOnUpdates!,
      runManually: metadata.runManually!,
      runAs: metadata.runAs,
      params: metadata.params ?? [],
      filters: metadata.filters ?? [],
      groupsAllowed: metadata.groupsAllowed ?? [],
    };
  }
  