import { isRoot } from "../../domain/nodes/node.ts";
import { Action, RunContext } from "/domain/actions/action.ts";

export default {
  uuid: "move_up",
  title: "Mover para cima",
  description: "Move o nó para uma pasta acima",
  builtIn: true,
  multiple: false,
  aspectConstraints: [],
  mimetypeConstraints: [],
  params: [],
  run,
} as Action;

function run(
  ctx: RunContext,
  _uuids: string[],
  _params?: Record<string, unknown>
): Promise<void | Error> {
  return ctx.nodeService.get(ctx.principal, _uuids[0]).then((node) => {
    if (!node.parent || isRoot(node.parent)) {
      return Promise.resolve();
    }

    return ctx.nodeService
      .get(ctx.principal, node.parent)
      .then(({ parent }) => {
        ctx.nodeService.update(ctx.principal, node.uuid, { parent }, true);
      });
  });
}
