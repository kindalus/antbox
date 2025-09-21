import type { AuthenticationContext } from "application/authentication_context.ts";
import type { NodeService } from "application/node_service.ts";
import type { RunContext } from "domain/features/feature_run_context.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { Feature } from "domain/features/feature.ts";

const moveToFolder: Feature = {
  uuid: "move_to_folder",
  name: "move_to_folder",
  description: "Move nodes to a target folder",
  exposeAction: true,
  runOnCreates: false,
  runOnUpdates: false,
  runManually: true,
  filters: [],
  exposeExtension: false,
  exposeAITool: true,
  runAs: undefined,
  groupsAllowed: [],
  parameters: [
    {
      name: "to",
      type: "string",
      required: true,
      description: "Target folder UUID",
      defaultValue: undefined,
    },
    {
      name: "uuids",
      type: "array",
      arrayType: "string",
      required: true,
      description: "Array of node UUIDs to move",
      defaultValue: undefined,
    },
  ],
  returnType: "void",
  returnDescription: "Moves the specified nodes to the target folder",

  async run(
    ctx: RunContext,
    args: Record<string, unknown>,
  ): Promise<void> {
    const parent = args["to"] as string;
    const uuids = args["uuids"] as string[];

    if (!parent) {
      throw new Error("Target folder UUID parameter 'to' is required");
    }

    if (!uuids || !Array.isArray(uuids) || uuids.length === 0) {
      throw new Error("Node UUIDs parameter 'uuids' is required");
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
      throw errors[0].value as AntboxError;
    }
  },
};

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

export default moveToFolder;
