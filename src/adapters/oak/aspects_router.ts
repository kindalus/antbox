import { Context, Router } from "../../../deps.ts";

import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { getTenant } from "./get_tenant.ts";
import { processError } from "./process_error.ts";
import { sendOK } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
  const getHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
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
    const service = getTenant(ctx, tenants).service;
    return service
      .listAspects(getRequestContext(ctx))
      .then((aspects) => {
        sendOK(ctx, aspects);
      })
      .catch((err) => processError(err, ctx));
  };

  const aspectsRouter = new Router({ prefix: "/aspects" });

  aspectsRouter.get("/", listHandler);
  aspectsRouter.get("/:uuid", getHandler);

  return aspectsRouter;
}
