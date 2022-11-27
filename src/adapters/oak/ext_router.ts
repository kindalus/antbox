import { Context, Router } from "/deps/oak";
import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";
import { sendInternalServerError } from "./send_response.ts";
import { ContextWithParams } from "./context_with_params.ts";

export const extRouter = new Router({ prefix: "/ext" });

extRouter.get("/:uuid", runHandler);
extRouter.post("/:uuid", runHandler);

function runHandler(ctx: ContextWithParams) {
  const request: Request = {} as Request;

  return EcmRegistry.instance.extService
    .run(getRequestContext(ctx), ctx.params.uuid, request)
    .then((resOrErr) => {
      if (resOrErr.isLeft()) {
        return sendInternalServerError(ctx, resOrErr.value);
      }

      return writeResponse(resOrErr.value, ctx);
    })
    .catch((err) => processError(err, ctx));
}

function writeResponse(response: globalThis.Response, ctx: Context) {
  ctx.response.headers.set(
    "Content-Type",
    response.headers.get("Content-Type")!
  );
  ctx.response.status = response.status;
  ctx.response.type = response.type;
  ctx.response.body = response.body;
}
