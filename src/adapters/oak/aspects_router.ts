import { Router, type Context } from "@oakserver/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { processError } from "api/process_error.ts";
import { Folders } from "domain/nodes/folders.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getTenant } from "./get_tenant.ts";
import { sendBadRequest, sendOK } from "./send_response.ts";

export default function (tenants: AntboxTenant[]) {
  const getHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).nodeService;
    return service
      .get(ctx, ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const listHandler = (ctx: Context) => {
    const service = getTenant(ctx, tenants).nodeService;
    return service
      .list(ctx, Folders.ASPECTS_FOLDER_UUID)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const exportHandler = async (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).nodeService;
    const uuid = ctx.params.uuid;

    return Promise.all([service.get(ctx, uuid), service.get(ctx, uuid)])
      .then(([node, blob]) => {
        if (node.isLeft()) {
          return processError(node.value);
        }

        if (blob.isLeft()) {
          return processError(blob.value);
        }

        ctx.response.headers.set("Content-Type", "application/json");
        ctx.response.headers.set("Content-length", blob.value.size.toString());
        ctx.response.headers.set(
          "Content-Disposition",
          `attachment; filename="${node.value.title}.json"`,
        );

        ctx.response.type = "blob";
        ctx.response.body = blob.value;
      })
      .catch((err) => processError(err));
  };

  const createOrReplaceAspect = async (ctx: Context) => {
    const service = getTenant(ctx, tenants).nodeService;
    const authCtx = ctx;

    const metadata = await ctx.request.body().value;
    if (!metadata) {
      return sendBadRequest(ctx, "Missing metadata");
    }

    return service
      .create(authCtx, metadata)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const deleteHandler = async (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).nodeService;
    return service
      .delete(ctx, ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err));
  };

  const aspectsRouter = new Router({ prefix: "/aspects" });

  aspectsRouter.get("/", listHandler);
  aspectsRouter.get("/:uuid", getHandler);
  aspectsRouter.post("/", createOrReplaceAspect);
  aspectsRouter.delete("/:uuid", deleteHandler);
  aspectsRouter.get("/:uuid/-/export", exportHandler);

  return aspectsRouter;
}

function processEither<L extends AntboxError, R>(ctx: Context, result: Either<L, R>) {
  if (result.isLeft()) {
    return processError(result.value);
  }

  return sendOK(ctx, result.value as Record<string, unknown>);
}
