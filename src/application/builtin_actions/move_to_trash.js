export default {
  uuid: "move_to_trash",
  title: "Mover para o lixo",
  description: "Move o nó para o lixo",
  run,
  builtIn: true,
  multiple: false,
  aspectConstraints: [],
  mimetypeConstraints: [],
  params: [],
};

/**
 * @param { Actions.RunContext } ctx
 * @param { Object } params
 * @param { String[] } uuids
 */
async function run(ctx, _params, uuids) {
  return await ctx.nodeService.update(ctx.principal, uuids[0], {
    trashed: true,
  });
}
