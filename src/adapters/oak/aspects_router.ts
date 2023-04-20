import { Context, Router } from "../../../deps.ts";
import { AntboxService } from "../../application/antbox_service.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { processError } from "./process_error.ts";
import { sendOK } from "./send_response.ts";

export default function (service: AntboxService) {
  const getHandler = (ctx: ContextWithParams) => {
    return service
      .getAspect(getRequestContext(ctx), ctx.params.uuid)
      .then((aspectOrErr) => {
        if (aspectOrErr.isLeft()) {
          return processError(aspectOrErr.value, ctx);
        }

        sendOK(ctx, aspectOrErr);
      })
      .catch((err) => processError(err, ctx));
  };

  const listHandler = (ctx: Context) => {
    return service
      .listAspects(getRequestContext(ctx))
      .then((listOrErr) => {
        if (listOrErr.isLeft()) {
          return processError(listOrErr.value, ctx);
        }

        sendOK(ctx, listOrErr.value);
      })
      .catch((err) => processError(err, ctx));
  };

  const aspectsRouter = new Router({ prefix: "/aspects" });

  aspectsRouter.get("/", listHandler);
  aspectsRouter.get("/:uuid", getHandler);

  return aspectsRouter;
}
