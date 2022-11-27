import { Context, Router, Status } from "/deps/oak";
import { getQuery } from "/deps/oak/helpers";

import { EcmRegistry } from "/application/ecm_registry.ts";
import { processError } from "./process_error.ts";
import { getRequestContext } from "./request_context_builder.ts";
import { Node } from "/domain/nodes/node.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { sendBadRequest, sendOK } from "./send_response.ts";

export const nodesRouter = new Router({ prefix: "/nodes" });

nodesRouter.get("/:uuid", getHandler);
nodesRouter.get("/:uuid/-/export", exportHandler);
nodesRouter.get("/:uuid/-/copy", copyHandler);
nodesRouter.get("/:uuid/-/evaluate", evaluateHandler);

nodesRouter.get("/", listHandler);

nodesRouter.post("/", createHandler);
nodesRouter.post("/-/query", queryHandler);

nodesRouter.patch("/:uuid", updateHandler);

nodesRouter.delete("/:uuid", deleteHandler);

function listHandler(ctx: Context) {
  const query = getQuery(ctx);

  const parent = query.parent?.length > 0 ? query.parent : undefined;

  return EcmRegistry.instance.nodeService
    .list(getRequestContext(ctx), parent)
    .then((result) => {
      if (result.isLeft()) {
        return processError(result.value, ctx);
      }

      return sendOK(ctx, result.value);
    })
    .catch((err) => processError(err, ctx));
}

function getHandler(ctx: ContextWithParams) {
  return EcmRegistry.instance.nodeService
    .get(getRequestContext(ctx), ctx.params.uuid)
    .then((result) => {
      if (result.isLeft()) {
        return processError(result.value, ctx);
      }

      ctx.response.status = Status.OK;
      ctx.response.type = "json";
      ctx.response.body = result.value;
    })
    .catch((err) => processError(err, ctx));
}

function exportHandler(ctx: ContextWithParams) {
  const uuid = ctx.params.uuid;
  const requestContext = getRequestContext(ctx);

  return Promise.all([
    EcmRegistry.instance.nodeService.get(requestContext, uuid),
    EcmRegistry.instance.nodeService.export(requestContext, uuid),
  ])
    .then(([node, blob]) => {
      if (node.isLeft()) {
        return processError(node.value, ctx);
      }

      if (blob.isLeft()) {
        return processError(blob.value, ctx);
      }

      ctx.response.headers.set("Content-Type", node.value.mimetype);
      ctx.response.headers.set("Content-length", blob.value.size.toString());

      ctx.response.type = "blob";
      ctx.response.body = blob.value;
    })
    .catch((err) => processError(err, ctx));
}

async function createHandler(ctx: Context) {
  const {
    type,
    metadata,
  }: { type?: "Folder" | "Metanode"; metadata: Partial<Node> } =
    await ctx.request.body().value;

  if (!metadata.title) {
    return Promise.resolve(sendBadRequest(ctx, "{ title } not given"));
  }

  const srv = EcmRegistry.instance.nodeService;
  const _ctx = getRequestContext(ctx);

  const creator =
    type === "Metanode"
      ? srv.createMetanode(_ctx, metadata)
      : srv.createFolder(_ctx, metadata);

  return creator
    .then((result) => sendOK(ctx, result))
    .catch((err) => processError(err, ctx));
}

async function updateHandler(ctx: ContextWithParams) {
  const body = await ctx.request.body().value;

  return EcmRegistry.instance.nodeService
    .update(getRequestContext(ctx), ctx.params.uuid, body)
    .then(() => sendOK(ctx))
    .catch((err) => processError(err, ctx));
}

function deleteHandler(ctx: ContextWithParams) {
  return EcmRegistry.instance.nodeService
    .delete(getRequestContext(ctx), ctx.params.uuid)
    .then(() => sendOK(ctx))
    .catch((err) => processError(err, ctx));
}

function copyHandler(ctx: ContextWithParams) {
  return EcmRegistry.instance.nodeService
    .copy(getRequestContext(ctx), ctx.params.uuid)
    .then((result) => {
      if (result.isLeft()) {
        return processError(result.value, ctx);
      }

      sendOK(ctx);
    })
    .catch((err) => processError(err, ctx));
}

async function queryHandler(ctx: Context) {
  const { filters, pageSize, pageToken } = await ctx.request.body().value;

  return EcmRegistry.instance.nodeService
    .query(getRequestContext(ctx), filters, pageSize, pageToken)
    .then((result) => sendOK(ctx, result))
    .catch((err) => processError(err, ctx));
}

function evaluateHandler(ctx: ContextWithParams) {
  return EcmRegistry.instance.nodeService
    .evaluate(getRequestContext(ctx), ctx.params.uuid)
    .then((result) => {
      if (result.isLeft()) {
        return processError(result.value, ctx);
      }

      sendOK(ctx, result.value);
    })
    .catch((err) => processError(err, ctx));
}
