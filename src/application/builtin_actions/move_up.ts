import { Action, RunContext } from "/domain/actions/action.ts";

export default {
  uuid: "move_up",
  title: "Mover para cima",
  description: "Move o nó para uma directoria acima",
  builtIn: true,
  multiple: false,
  aspectConstraints: [],
  mimetypeConstraints: [],
  params: [],
  run,
} as Action;

function run(
  _ctx: RunContext,
  _uuids: string[],
  _params?: Record<string, unknown>
): Promise<void | Error> {
  return Promise.resolve();
}
