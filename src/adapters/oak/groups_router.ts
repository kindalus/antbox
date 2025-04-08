import { Router, Status, type Context } from "@oakserver/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { processError } from "api/process_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { getTenant } from "./get_tenant.ts";
import { sendOK } from "./send_response.ts";

export default function (tenants: AntboxTenant[]) {
  const listHandler = (ctx: Context) => {
    const service = getTenant(ctx, tenants).nodeService;

    return service
      .list(ctx, Folders.GROUPS_FOLDER_UUID)
      .then((result) => {
        if (result.isLeft()) {
          return processError(result.value);
        }

        return sendOK(ctx, result.value);
      })
      .catch((err) => processError(err));
  };

  const getHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).nodeService;
    return service
      .get(ctx, ctx.params.uuid)
      .then((result) => {
        if (result.isLeft()) {
          return processError(result.value);
        }

        ctx.response.status = Status.OK;
        ctx.response.type = "json";
        ctx.response.body = result.value;
      })
      .catch((err) => processError(err));
  };

  const createHandler = async (ctx: Context) => {
    const service = getTenant(ctx, tenants).nodeService;
    const body = await ctx.request.body().value;

    return service
      .create(ctx, body)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const updateHandler = async (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).nodeService;
    const body = await ctx.request.body().value;

    return service
      .update(ctx, ctx.params.uuid, body)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const deleteHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).nodeService;
    return service
      .delete(ctx, ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const groupsRouter = new Router({ prefix: "/groups" });

  groupsRouter.get("/:uuid", getHandler);

  groupsRouter.get("/", listHandler);

  groupsRouter.post("/", createHandler);

  groupsRouter.patch("/:uuid", updateHandler);

  groupsRouter.delete("/:uuid", deleteHandler);

  return groupsRouter;
}

function processEither<L extends AntboxError, R>(ctx: Context, result: Either<L, R>) {
  if (result.isLeft()) {
    return processError(result.value);
  }

  return sendOK(ctx, result.value as Record<string, unknown>);
}
