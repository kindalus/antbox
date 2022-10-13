import { Action, RunContext } from "/domain/actions/action.ts";

export default {
  uuid: "move_to_trash",
  title: "Mover para o lixo",
  description: "Move o nó para o lixo",
  builtIn: true,
  multiple: false,
  aspectConstraints: [],
  mimetypeConstraints: [],
  params: [],
  runManually: true,

  async run(
    ctx: RunContext,
    uuids: string[],
    _params?: Record<string, unknown>
  ): Promise<void | Error> {
    const resultOrErr = await ctx.nodeService.update(
      ctx.principal,
      uuids[0],
      {
        trashed: true,
      },
      true
    );

    if (resultOrErr.isLeft()) {
      return resultOrErr.value;
    }
  },
} as Action;
