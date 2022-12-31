import { Context, Router } from "/deps/oak";
import { processError } from "./process_error.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { sendOK } from "./send_response.ts";
import { AntboxService } from "../../application/antbox_service.ts";
import { getRequestContext } from "./get_request_context.ts";

export default function (service: AntboxService) {
  const getHandler = (ctx: ContextWithParams) => {
    return service
      .getAspect(getRequestContext(ctx), ctx.params.uuid)
      .then((aspect) => sendOK(ctx, aspect))
      .catch((err) => processError(err, ctx));
  };

  const listHandler = (ctx: Context) => {
    return service
      .listAspects(getRequestContext(ctx))
      .then((list) => sendOK(ctx, list))
      .catch((err) => processError(err, ctx));
  };

  const aspectsRouter = new Router({ prefix: "/aspects" });

  aspectsRouter.get("/", listHandler);
  aspectsRouter.get("/:uuid", getHandler);

  return aspectsRouter;
}
