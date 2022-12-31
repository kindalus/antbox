import { Context, Router } from "/deps/oak";
import { processError } from "./process_error.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { AntboxService } from "../../application/antbox_service.ts";
import { sendInternalServerError } from "./send_response.ts";
import { getRequestContext } from "./get_request_context.ts";

export default function (service: AntboxService) {
  const extRouter = new Router({ prefix: "/ext" });

  const runHandler = (ctx: ContextWithParams) => {
    const request: Request = {} as Request;

    return service
      .runExtension(getRequestContext(ctx), ctx.params.uuid, request)
      .then((resOrErr) => {
        if (resOrErr.isLeft()) {
          return sendInternalServerError(ctx, resOrErr.value);
        }

        return writeResponse(resOrErr.value, ctx);
      })
      .catch((err) => processError(err, ctx));
  };

  function writeResponse(response: globalThis.Response, ctx: Context) {
    ctx.response.headers.set(
      "Content-Type",
      response.headers.get("Content-Type")!
    );
    ctx.response.status = response.status;
    ctx.response.type = response.type;
    ctx.response.body = response.body;
  }

  extRouter.get("/:uuid", runHandler);
  extRouter.post("/:uuid", runHandler);

  return extRouter;
}
