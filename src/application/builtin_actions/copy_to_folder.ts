import type { RunContext } from "domain/features/feature_run_context.ts";
import { Feature } from "domain/features/feature.ts";

export default {
  uuid: "copy_to_folder",
  title: "Copiar para pasta",
  description: "Copia os nós para uma pasta",
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
      return Promise.reject(new Error("Error parameter not given"));
    }

    const batchCopy = uuids.map((u) =>
      ctx.nodeService.copy(ctx.authenticationContext, u, parent)
    );
    const results = await Promise.all(batchCopy);

    const errors = results.filter((r) => r.isLeft());

    if (errors.length > 0) {
      return errors[0].value as Error;
    }

    return;
  },
} as unknown as Feature;
