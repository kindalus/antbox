import type { AuthenticationContext } from "application/authentication_context.ts";
import type { NodeService } from "application/node_service.ts";
import type { RunContext } from "domain/features/feature_run_context.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { Feature } from "domain/features/feature.ts";

export default {
  uuid: "move_to_folder",
  title: "Mover para pasta",
  description: "Move os nós para uma pasta",
  builtIn: true,
  multiple: true,
  filters: [],
  parameters: [
    {
      name: "to",
      type: "string",
      required: true,
      description: "Target folder UUID",
    },
  ],
  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,

  groupsAllowed: [],

  async run(
    ctx: RunContext,
    uuids: string[],
    params: Record<string, string>,
  ): Promise<void | Error> {
    const parent = params["to"];

    if (!parent) {
      return new Error("Error parameter not given");
    }

    const toUpdateTask = updateTaskPredicate(
      ctx.authenticationContext,
      ctx.nodeService,
      parent,
    );

    const taskPromises = uuids.map(toUpdateTask);

    const results = await Promise.all(taskPromises);

    const errors = results.filter(errorResultsOnly);

    if (errors.length > 0) {
      return errors[0].value as AntboxError;
    }

    return;
  },
} as unknown as Feature;

function updateTaskPredicate(
  ctx: AuthenticationContext,
  nodeService: NodeService,
  parent: string,
) {
  return (uuid: string) => nodeService.update(ctx, uuid, { parent });
}

function errorResultsOnly(
  voidOrErr: Either<NodeNotFoundError, unknown>,
): boolean {
  return voidOrErr.isLeft();
}
