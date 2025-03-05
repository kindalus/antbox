import { Router, type Context } from "@oakserver/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { deleteHandler, exportHandler, getHandler, listHandler } from "api/aspects_handlers.ts";
import { processError } from "api/process_error.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { adapt } from "./adapt.ts";
import { sendOK } from "./send_response.ts";

export default function (tenants: AntboxTenant[]) {
  const aspectsRouter = new Router({ prefix: "/aspects" });

  aspectsRouter.get("/", adapt(listHandler(tenants)));
  aspectsRouter.get("/:uuid", adapt(getHandler(tenants)));
  aspectsRouter.delete("/:uuid", adapt(deleteHandler(tenants)));
  aspectsRouter.get("/:uuid/-/export", adapt(exportHandler(tenants)));
  // aspectsRouter.post("/", createOrReplaceAspect);

  return aspectsRouter;

  // const createOrReplaceAspect = async (ctx: Context) => {
  //   const service = getTenant(ctx, tenants).nodeService;
  //   const authCtx = ctx;

  //   const metadata = await ctx.request.body().value;
  //   if (!metadata) {
  //     return sendBadRequest(ctx, "Missing metadata");
  //   }

  //   return service
  //     .create(authCtx, metadata)
  //     .then((result) => processEither(ctx, result))
  //     .catch((err) => processError(err));
  // };

  // const getHandler = (ctx: ContextWithParams) => {
  //   const service = getTenant(ctx, tenants).nodeService;
  //   return service
  //     .get(ctx, ctx.params.uuid)
  //     .then((result) => processEither(ctx, result))
  //     .catch((err) => processError(err));
  // };

  // const listHandler = (ctx: Context) => {
  //   const service = getTenant(ctx, tenants).nodeService;
  //   return service
  //     .list(ctx, Folders.ASPECTS_FOLDER_UUID)
  //     .then((result) => processEither(ctx, result))
  //     .catch((err) => processError(err));
  // };

  // const exportHandler = async (ctx: ContextWithParams) => {
  //   const service = getTenant(ctx, tenants).nodeService;
  //   const uuid = ctx.params.uuid;

  //   return Promise.all([service.get(ctx, uuid), service.get(ctx, uuid)])
  //     .then(([node, blob]) => {
  //       if (node.isLeft()) {
  //         return processError(node.value);
  //       }

  //       if (blob.isLeft()) {
  //         return processError(blob.value);
  //       }

  //       ctx.response.headers.set("Content-Type", "application/json");
  //       ctx.response.headers.set("Content-length", blob.value.size.toString());
  //       ctx.response.headers.set(
  //         "Content-Disposition",
  //         `attachment; filename="${node.value.title}.json"`,
  //       );

  //       ctx.response.type = "blob";
  //       ctx.response.body = blob.value;
  //     })
  //     .catch((err) => processError(err));
  // };

  // const deleteHandler = async (ctx: ContextWithParams) => {
  //   const service = getTenant(ctx, tenants).nodeService;
  //   return service
  //     .delete(ctx, ctx.params.uuid)
  //     .then((result) => processEither(ctx, result))
  //     .catch((err) => processError(err));
  // };
}

function processEither<L extends AntboxError, R>(ctx: Context, result: Either<L, R>) {
  if (result.isLeft()) {
    return processError(result.value);
  }

  return sendOK(ctx, result.value as Record<string, unknown>);
}
