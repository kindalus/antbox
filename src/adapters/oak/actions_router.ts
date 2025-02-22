import { Context, Router } from "@oakserver/oak";
import type { AntboxTenant } from "api/antbox_tenant";
import { getQuery } from "api/get_query";
import { processError } from "api/process_error";
import type { AntboxError } from "shared/antbox_error";
import type { Either } from "shared/either";
import { getTenant } from "./get_tenant";
import { sendBadRequest, sendOK } from "./send_response";

export default function (tenants: AntboxTenant[]) {
  const getHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    return service
      .getAction(getRequestContext(ctx), ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const listHandler = (ctx: Context) => {
    const service = getTenant(ctx, tenants).service;
    return service
      .listActions(getRequestContext(ctx))
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const runHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    const query = getQuery(ctx);
    if (!query.uuids) {
      return sendBadRequest(ctx, "Missing uuids query parameter");
    }

    const uuids = query.uuids.split(",");

    return service
      .runAction(getRequestContext(ctx), ctx.params.uuid, uuids, query)
      .then((result) => {
        if (result.isLeft()) {
          return processError(result.value, ctx);
        }

        sendOK(ctx);
      })
      .catch((err) => processError(err, ctx));
  };

  const exportHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    const requestContext = getRequestContext(ctx);
    const uuid = ctx.params.uuid;

    return Promise.all([
      service.getAction(requestContext, uuid),
      service.exportAction(requestContext, uuid),
    ])
      .then(([node, blob]) => {
        if (node.isLeft()) {
          return processError(node.value, ctx);
        }

        if (blob.isLeft()) {
          return processError(blob.value, ctx);
        }

        ctx.response.headers.set("Content-Type", "application/javascript");
        ctx.response.headers.set("Content-length", blob.value.size.toString());
        ctx.response.headers.set(
          "Content-Disposition",
          `attachment; filename="${node.value.title}.js"`,
        );

        ctx.response.type = "blob";
        ctx.response.body = blob.value;
      })
      .catch((err) => processError(err, ctx));
  };

  const deleteHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    return service
      .deleteAction(getRequestContext(ctx), ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const actionsRouter = new Router({ prefix: "/actions" });

  actionsRouter.get("/:uuid/-/run", runHandler);

  actionsRouter.get("/", listHandler);
  actionsRouter.get("/:uuid", getHandler);
  actionsRouter.delete("/:uuid", deleteHandler);
  actionsRouter.get("/:uuid/-/export", exportHandler);

  return actionsRouter;
}

function processEither<L extends AntboxError, R>(
  ctx: Context,
  result: Either<L, R>,
) {
  if (result.isLeft()) {
    return processError(result.value, ctx);
  }

  return sendOK(ctx, result.value as Record<string, unknown>);
}
