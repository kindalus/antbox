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
  run,
} as Action;

function run(
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

  return Promise.all(batchCopy)
    .then(batchMove)
    .then(() => {});
}
