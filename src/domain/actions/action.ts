import { type NodeFilter } from "domain/nodes/node_filter.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ActionNode } from "domain/actions/action_node.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { FunctionParameter } from "domain/functions/function_node.ts";

export interface Action {
  uuid: string;
  title: string;
  description: string;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  runAs?: string;
  parameters: FunctionParameter[];

  filters: NodeFilter[];
  groupsAllowed: string[];
}

export async function fileToAction(
  file: File,
): Promise<Either<AntboxError, Action>> {
  try {
    const url = URL.createObjectURL(file);
    const mod = await import(url);

    return right(mod.default as Action);
  } catch (err: unknown) {
    if (err instanceof Error) {
      return left(new UnknownError(err.message));
    }

    return left(new UnknownError(JSON.stringify(err, null, 3)));
  }
}

export function actionToNodeMetadata(
  action: Action,
  owner?: string,
): NodeMetadata {
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
  } as NodeMetadata;
}

export function actionNodeToNodeMetadata(action: ActionNode): NodeMetadata {
  return {
    uuid: action.uuid,
    title: action.title,
    description: action.description!,
    mimetype: action.mimetype,
    filters: action.filters,
    runAs: action.runAs,
    params: action.params,
    groupsAllowed: action.groupsAllowed,
    runOnCreates: action.runOnCreates,
    runOnUpdates: action.runOnUpdates,
    runManually: action.runManually,
  } as NodeMetadata;
}
