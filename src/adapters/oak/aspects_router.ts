import { Context, Router } from "/deps/oak";
import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { sendOK } from "./send_response.ts";

export const aspectsRouter = new Router({ prefix: "/aspects" });

aspectsRouter.get("/", listHandler);
aspectsRouter.get("/:uuid", getHandler);

function getHandler(ctx: ContextWithParams) {
  return EcmRegistry.instance.aspectService
    .get(getRequestContext(ctx), ctx.params.uuid)
    .then((aspect) => sendOK(ctx, aspect))
    .catch((err) => processError(err, ctx));
}

function listHandler(ctx: Context) {
  return EcmRegistry.instance.aspectService
    .list(getRequestContext(ctx))
    .then((list) => sendOK(ctx, list))
    .catch((err) => processError(err, ctx));
}
