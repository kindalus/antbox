import { type NodeFilter } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { FeatureParameter } from "domain/features/feature_node.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
import { RunContext } from "domain/features/feature_run_context.ts";

export interface Action {
  uuid: string;
  title: string;
  description: string;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  runAs?: string;
  parameters: FeatureParameter[];

  filters: NodeFilter[];
  groupsAllowed: string[];

  run(
    ctx: RunContext,
    uuids: string[],
    params?: Record<string, unknown>,
  ): Promise<void | Error>;
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
    parameters: action.parameters,
    filters: action.filters,
    groupsAllowed: action.groupsAllowed,
    mimetype: Nodes.ACTION_MIMETYPE,
    owner: owner || undefined,
  };
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
