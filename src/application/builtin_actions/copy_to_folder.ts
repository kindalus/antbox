import { Action, RunContext } from "/domain/actions/action.ts";

export default {
  uuid: "copy_to_folder",
  title: "Copiar para pasta",
  description: "Copia os nós para uma pasta",
  builtIn: true,
  multiple: true,
  aspectConstraints: [],
  mimetypeConstraints: [],
  params: ["destination"],
  runManually: true,

  async run(
    ctx: RunContext,
    uuids: string[],
    params: Record<string, string>
  ): Promise<void | Error> {
    const parent = params["destination"];

    if (!parent) {
      return Promise.reject(new Error("Error parameter not given"));
    }

    const batchCopy = uuids.map((u) => ctx.nodeService.copy(ctx.principal, u));

    const batchMove = (newUuids: string[]) =>
      newUuids.map((u) =>
        ctx.nodeService.update(ctx.principal, u, { parent }, true)
      );

    const uuidsOrErrs = await Promise.all(batchCopy);

    const newUuids = uuidsOrErrs
      .filter((u) => u.isRight())
      .map((u) => u.value as string);

    return Promise.all(batchMove(newUuids)).then(() => {});
  },
} as Action;
