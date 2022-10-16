import { Node } from "../../domain/nodes/node.ts";
import { Action, RunContext } from "/domain/actions/action.ts";

export default {
  uuid: "move_up",
  title: "Mover para cima",
  description: "Move o nó para uma pasta acima",
  builtIn: true,
  multiple: false,
  runManually: true,
  runOnCreates: false,
  runOnUpdates: false,
  filters: [],
  params: [],

  async run(
    ctx: RunContext,
    _uuids: string[],
    _params?: Record<string, unknown>
  ): Promise<void | Error> {
    const node = await ctx.nodeService.get(ctx.principal, _uuids[0]);

    if (node.isLeft()) {
      return node.value;
    }

    if (Node.isRootFolder(node.value.parent)) {
      return;
    }

    const parent = await ctx.nodeService.get(ctx.principal, node.value.parent);

    if (parent.isLeft()) {
      return parent.value;
    }

    if (!parent.value.isFolder()) {
      return;
    }

    ctx.nodeService.update(
      ctx.principal,
      node.value.uuid,
      { parent: parent.value.parent },
      true
    );
  },
} as Action;
