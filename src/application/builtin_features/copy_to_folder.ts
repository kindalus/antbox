import type { RunContext } from "domain/features/feature_run_context.ts";
import { Feature } from "domain/features/feature.ts";

const copyToFolder: Feature = {
  uuid: "copy_to_folder",
  name: "copy_to_folder",
  description: "Copy nodes to a target folder",
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
  ],
  returnType: "void",
  returnDescription: "Copies the specified nodes to the target folder",

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

    const batchCopy = uuids.map((u) =>
      ctx.nodeService.copy(ctx.authenticationContext, u, parent)
    );
    const results = await Promise.all(batchCopy);

    const errors = results.filter((r) => r.isLeft());

    if (errors.length > 0) {
      throw errors[0].value as Error;
    }
  },
};

export default copyToFolder;
