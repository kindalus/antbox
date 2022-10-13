import { Action, RunContext } from "/domain/actions/action.ts";

export default {
  uuid: "move_to_trash",
  title: "Mover para o lixo",
  description: "Move o nó para o lixo",
  builtIn: true,
  multiple: false,
  runManually: true,
  aspectConstraints: [],
  mimetypeConstraints: ["web-content"],
  params: [],

  async run(
    ctx: RunContext,
    uuids: string[],
    _params?: Record<string, unknown>
  ): Promise<void | Error> {
    await ctx.nodeService.update(
      ctx.principal,
      uuids[0],
      {
        properties: {
          "web-content:published": true,
        },
      },
      true
    );
  },
} as Action;
