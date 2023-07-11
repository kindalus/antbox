import { Context, getQuery, Router } from "../../../deps.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { getTenant } from "./get_tenant.ts";
import { processError } from "./process_error.ts";
import { sendBadRequest, sendOK } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
  const getHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    return service
      .getAction(getRequestContext(ctx), ctx.params.uuid)
      .then((actionOrErr) => {
        if (actionOrErr.isLeft()) {
          return processError(actionOrErr.value, ctx);
        }
        sendOK(ctx, actionOrErr);
      })
      .catch((err) => processError(err, ctx));
  };

  const listHandler = (ctx: Context) => {
    const service = getTenant(ctx, tenants).service;
    return service
      .listActions(getRequestContext(ctx))
      .then((actions) => {
        sendOK(ctx, actions);
      })
      .catch((err) => {
        return processError(err, ctx);
      });
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

  const actionsRouter = new Router({ prefix: "/actions" });

  actionsRouter.get("/", listHandler);
  actionsRouter.get("/:uuid", getHandler);
  actionsRouter.get("/:uuid/-/run", runHandler);

  return actionsRouter;
}
