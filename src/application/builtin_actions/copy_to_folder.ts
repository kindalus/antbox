import { Action } from "domain/actions/action.ts";
import { RunContext } from "domain/actions/run_context.ts";

export default {
  uuid: "copy_to_folder",
  title: "Copiar para pasta",
  description: "Copia os nós para uma pasta",
  builtIn: true,
  multiple: true,
  filters: [],
  params: ["to"],
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
      ctx.nodeService.copy(ctx.authenticationContext, u, parent),
    );
    const results = await Promise.all(batchCopy);

    const errors = results.filter((r) => r.isLeft());

    if (errors.length > 0) {
      return errors[0].value as Error;
    }

    return;
  },
} as Action;
