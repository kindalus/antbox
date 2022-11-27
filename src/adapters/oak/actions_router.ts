import { Context, Router } from "/deps/oak";
import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";
import { getQuery } from "https://deno.land/x/oak@v11.1.0/helpers.ts";
import { sendBadRequest, sendOK } from "./send_response.ts";
import { ContextWithParams } from "./context_with_params.ts";

export const actionsRouter = new Router({ prefix: "/actions" });

actionsRouter.get("/", listHandler);
actionsRouter.get("/:uuid", getHandler);
actionsRouter.get("/:uuid/-/run", runHandler);

function getHandler(ctx: ContextWithParams) {
  return EcmRegistry.instance.actionService
    .get(getRequestContext(ctx), ctx.params.uuid)
    .then((action) => sendOK(ctx, action))
    .catch((err) => processError(err, ctx));
}

function listHandler(ctx: Context) {
  return EcmRegistry.instance.actionService
    .list(getRequestContext(ctx))
    .then((list) => sendOK(ctx, list))
    .catch((err) => processError(err, ctx));
}

function runHandler(ctx: ContextWithParams) {
  const query = getQuery(ctx);
  if (!query.uuids) {
    return sendBadRequest(ctx, "Missing uuids query parameter");
  }

  const uuids = query.uuids.split(",");

  return EcmRegistry.instance.actionService
    .run(getRequestContext(ctx), ctx.params.uuid, uuids, query)
    .then(() => sendOK(ctx))
    .catch((err) => processError(err, ctx));
}
