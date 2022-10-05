export const spec = {
  title: "Mover para o lixo",
  description: "Move o nó para o lixo",
  builtIn: true,
  multiple: false,
  aspectConstraints: [],
  mimetypeConstraints: [],
  params: [],
};

/**
 * @param { Actions.RunContext } ctx
 * @param { String[] } uuids
 * @param { Object } params
 */
export async function run(ctx, uuids) {
  return await ctx.nodeService.update(ctx.principal, uuids[0], {
    trashed: true,
  });
}

export default {
  uuid: "move_to_trash",
  spec,
  run,
};
