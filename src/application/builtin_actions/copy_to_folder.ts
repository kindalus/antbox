import { Action, RunContext } from "/domain/actions/action.ts";

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

  run(
    ctx: RunContext,
    uuids: string[],
    params: Record<string, string>
  ): Promise<void | Error> {
    const parent = params["to"];

    if (!parent) {
      return Promise.reject(new Error("Error parameter not given"));
    }

    const batchCopy = uuids.map((u) =>
      ctx.nodeService.copy(ctx.principal, u, parent)
    );

    return Promise.all(batchCopy).then(() => {});
  },
} as Action;
