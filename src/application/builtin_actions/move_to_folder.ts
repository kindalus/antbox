import { Action, RunContext } from "/domain/actions/action.ts";

export default {
  uuid: "move_to_folder",
  title: "Mover para pasta",
  description: "Move os nós para uma pasta",
  builtIn: true,
  multiple: true,
  aspectConstraints: [],
  mimetypeConstraints: [],
  params: ["destination"],
  runManually: true,
  run(
    ctx: RunContext,
    uuids: string[],
    params: Record<string, string>
  ): Promise<void | Error> {
    const parent = params["destination"];

    if (!parent) {
      return Promise.reject(new Error("Error parameter not given"));
    }

    const batch = uuids.map((u) =>
      ctx.nodeService.update(ctx.principal, u, { parent }, true)
    );

    return Promise.all(batch).then(() => {});
  },
} as Action;
