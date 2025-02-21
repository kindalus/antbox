import { Router } from "../../../deps.ts";
import { AntboxTenant } from "../../api/antbox_tenant.ts";

import {
	copyHandler,
	createHandler,
	deleteHandler,
	duplicateHandler,
	evaluateHandler,
	exportHandler,
	findHandler,
	getHandler,
	listHandler,
	recognizeHandler,
	updateHandler,
} from "../../api/nodes_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const nodesRouter = new Router({ prefix: "/nodes" });

	nodesRouter.get("/:uuid", adapt(getHandler(tenants)));
	nodesRouter.get("/:uuid/-/export", adapt(exportHandler(tenants)));
	nodesRouter.get("/:uuid/-/duplicate", adapt(duplicateHandler(tenants)));
	nodesRouter.get("/:uuid/-/evaluate", adapt(evaluateHandler(tenants)));

	nodesRouter.get("/", adapt(listHandler(tenants)));

	nodesRouter.post("/", adapt(createHandler(tenants)));
	nodesRouter.post("/:uuid/-/copy", adapt(copyHandler(tenants)));

	nodesRouter.post("/-/query", adapt(findHandler(tenants)));
	nodesRouter.post("/-/find", adapt(findHandler(tenants)));

	nodesRouter.patch("/:uuid", adapt(updateHandler(tenants)));

	nodesRouter.delete("/:uuid", adapt(deleteHandler(tenants)));

	nodesRouter.get("/:uuid/-/ocr", adapt(recognizeHandler(tenants)));

	return nodesRouter;
}
/*
  const listHandler = async (ctx: Context) => {
		const handler = nodesApi.listHandler(tenants);

		const req = adapt(ctx);
	};

	const listHandler = (ctx: Context) => {
		const service = getTenant(ctx, tenants).service;
		const query = getQuery(ctx);

		const parent = query.parent?.length > 0 ? query.parent : undefined;

		return service
			.list(getRequestContext(ctx), parent)
			.then((result) => {
				if (result.isLeft()) {
					return processError(result.value, ctx);
				}

				return sendOK(ctx, result.value);
			})
			.catch((err) => processError(err, ctx));
	};

  const getHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    return service
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
  };

  const exportHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    const uuid = ctx.params.uuid;
    const requestContext = getRequestContext(ctx);

    return Promise.all([
      service.get(requestContext, uuid),
      service.export(requestContext, uuid),
    ])
      .then(([node, blob]) => {
        if (node.isLeft()) {
          return processError(node.value, ctx);
        }

        if (blob.isLeft()) {
          return processError(blob.value, ctx);
        }

        ctx.response.headers.set(
          "Content-Type",
          mapSystemNodeType(node.value.mimetype),
        );
        ctx.response.headers.set("Content-length", blob.value.size.toString());

        ctx.response.type = "blob";
        ctx.response.body = blob.value;
      })
      .catch((err) => processError(err, ctx));
  };

  const createHandler = async (ctx: Context) => {
    const service = getTenant(ctx, tenants).service;
    const metadata: Partial<Node> = await ctx.request.body().value;

    if (!metadata?.mimetype) {
      return Promise.resolve(sendBadRequest(ctx, "{ mimetype } not given"));
    }

    return service
      .create(getRequestContext(ctx), metadata)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const updateHandler = async (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    const body = await ctx.request.body().value;

    return service
      .update(getRequestContext(ctx), ctx.params.uuid, body)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const deleteHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    return service
      .delete(getRequestContext(ctx), ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const copyHandler = async (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    const { to }: { to: string } = await ctx.request.body().value;

    return service
      .copy(getRequestContext(ctx), ctx.params.uuid, to)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const duplicateHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    return service
      .duplicate(getRequestContext(ctx), ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const findHandler = async (ctx: Context) => {
    const service = getTenant(ctx, tenants).service;
    const { filters, pageSize, pageToken } = await ctx.request.body().value;

    return service
      .find(getRequestContext(ctx), filters, pageSize, pageToken)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const evaluateHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;
    return service
      .evaluate(getRequestContext(ctx), ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

  const recognizeHandler = (ctx: ContextWithParams) => {
    const service = getTenant(ctx, tenants).service;

    return service
      .recognizeText(getRequestContext(ctx), ctx.params.uuid)
      .then((result) => processEither(ctx, result))
      .catch((err) => processError(err, ctx));
  };

function mapSystemNodeType(type: string): string {
  switch (type) {
    case Node.ASPECT_MIMETYPE:
      return "application/json";
    case Node.EXT_MIMETYPE:
    case Node.ACTION_MIMETYPE:
      return "text/javascript";
    default:
      return type;
  }
}*/
