import { Context, getQuery, Router, Status } from "../../../deps.ts";
import { Node } from "../../domain/nodes/node.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { getTenantByHeaders, getTenantBySearchParams } from "./get_tenant.ts";
import { processEither } from "./process_either.ts";
import { processError } from "./process_error.ts";
import { sendBadRequest, sendOK } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
	const listHandler = (ctx: Context) => {
		const service = getTenantByHeaders(ctx, tenants).service;
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
		const service = getTenantByHeaders(ctx, tenants).service;
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
		const requestContext = getRequestContext(ctx);
		const uuid = ctx.params.uuid;
		const service = getTenantBySearchParams(ctx, tenants).service;

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
		const service = getTenantByHeaders(ctx, tenants).service;
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
		const service = getTenantByHeaders(ctx, tenants).service;
		const body = await ctx.request.body().value;

		return service
			.update(getRequestContext(ctx), ctx.params.uuid, body)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const deleteHandler = (ctx: ContextWithParams) => {
		const service = getTenantByHeaders(ctx, tenants).service;
		return service
			.delete(getRequestContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const copyHandler = async (ctx: ContextWithParams) => {
		const service = getTenantByHeaders(ctx, tenants).service;
		const { to }: { to: string } = await ctx.request.body().value;

		return service
			.copy(getRequestContext(ctx), ctx.params.uuid, to)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const duplicateHandler = (ctx: ContextWithParams) => {
		const service = getTenantByHeaders(ctx, tenants).service;
		return service
			.duplicate(getRequestContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const queryHandler = async (ctx: Context) => {
		const service = getTenantByHeaders(ctx, tenants).service;
		const { filters, pageSize, pageToken } = await ctx.request.body().value;

		return service
			.query(getRequestContext(ctx), filters, pageSize, pageToken)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const evaluateHandler = (ctx: ContextWithParams) => {
		const service = getTenantByHeaders(ctx, tenants).service;
		return service
			.evaluate(getRequestContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const nodesRouter = new Router({ prefix: "/nodes" });

	nodesRouter.get("/:uuid", getHandler);
	nodesRouter.get("/:uuid/-/export?", exportHandler);
	nodesRouter.get("/:uuid/-/duplicate", duplicateHandler);
	nodesRouter.get("/:uuid/-/evaluate", evaluateHandler);

	nodesRouter.get("/", listHandler);

	nodesRouter.post("/", createHandler);
	nodesRouter.post("/:uuid/-/copy", copyHandler);
	nodesRouter.post("/-/query", queryHandler);

	nodesRouter.patch("/:uuid", updateHandler);

	nodesRouter.delete("/:uuid", deleteHandler);

	return nodesRouter;
}

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
}
