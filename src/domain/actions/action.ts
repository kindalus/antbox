import type { AuthenticationContext } from "application/authentication_context.ts";
import { type NodeFilter } from "domain/nodes/node_filter.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { ActionNode } from "./action_node.ts";
import { type RunContext } from "./run_context.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { Nodes } from "domain/nodes/nodes.ts";

/**
 * Regras das actions:
 * - para poder executar runOnCreate ou runOnUpdate
 * --- especificar aspect ou mimetype constraints
 * --- não pode especificar parametros
 *
 * - para ser executar como trigger das folders
 * --- tem que especificar o mimetype 'application/folder'
 * --- a folder tem que conter um dos aspectos especificados na mimetype constraints
 *
 * - para poder executar na interface gráfica, recomenda-se:
 * --- não pode especificar parametros
 * --- deve ter runManually = true
 * --- o nó deve especificar um mimetype e um dos aspectos
 *     especificados na mimetype e aspect constraints
 *
 * - se não for especificado, pode correr manualmente
 * - se não for especificado pelo runAs, corre com os privilégios do grupo
 */
export interface Action {
  uuid: string;
  title: string;
  description: string;
  builtIn: boolean;
  runOnCreates: boolean;
  runOnUpdates: boolean;
  runManually: boolean;
  runAs?: string;
  params: string[];

  filters: NodeFilter[];
  groupsAllowed: string[];

  run: (
    ctx: RunContext,
    uuids: string[],
    params?: Record<string, string>,
  ) => Promise<void | Error>;
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
