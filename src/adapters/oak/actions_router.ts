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
    const service = getTenant(ctx, tenants).actionService;
    return service
      .get(ctx, ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const listHandler = (ctx: Context) => {
    const service = getTenant(ctx, tenants).actionService;
    return service
      .list(ctx)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const runHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).actionService;
    const query = getQuery(ctx);
    if (!query.uuids) {
      return sendBadRequest(ctx, "Missing uuids query parameter");
    }

    const uuids = query.uuids.split(",");

    return service
      .run(ctx, ctx.params.uuid, uuids, query)
      .then((result) => {
        if (result.isLeft()) {
          return processError(result.value);
        }

        sendOK(ctx);
      })
      .catch((err) => processError(err));
  };

  const exportHandler = async (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).actionService;
    const requestContext = ctx;
    const uuid = ctx.params.uuid;

    return Promise.all([service.get(requestContext, uuid), service.export(requestContext, uuid)])
      .then(([node, blob]) => {
        if (node.isLeft()) {
          return processError(node.value);
        }

        if (blob.isLeft()) {
          return processError(blob.value);
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
      .catch((err) => processError(err));
  };

  const deleteHandler = async (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).actionService;
    return service
      .delete(ctx, ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const actionsRouter = new Router({ prefix: "/actions" });

  actionsRouter.get("/:uuid/-/run", runHandler);

  actionsRouter.get("/", listHandler);
  actionsRouter.get("/:uuid", getHandler);
  actionsRouter.delete("/:uuid", deleteHandler);
  actionsRouter.get("/:uuid/-/export", exportHandler);

  return actionsRouter;
}

function processEither<L extends AntboxError, R>(ctx: Context, result: Either<L, R>) {
  if (result.isLeft()) {
    return processError(result.value);
  }

  return sendOK(ctx, result.value as Record<string, unknown>);
}
