import { Context, OakRequest, Router } from "../../../deps.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { getTenant } from "./get_tenant.ts";
import { processEither } from "./process_either.ts";
import { processError } from "./process_error.ts";
import { sendInternalServerError } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
	const extRouter = new Router({ prefix: "/ext" });

	const runHandler = async (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		const request = await fromOakRequest(ctx.request);

		return service
			.runExtension(ctx.params.uuid, request)
			.then((resOrErr) => {
				if (resOrErr.isLeft()) {
					return sendInternalServerError(ctx, resOrErr.value);
				}

				return writeResponse(resOrErr.value, ctx);
			})
			.catch((err) => processError(err, ctx));
	};

	const listHandler = (ctx: Context) => {
		const service = getTenant(ctx, tenants).service;
		const authCtx = getRequestContext(ctx);

		return service
			.listExtensions(authCtx)
			.then((r) => processEither(ctx, r))
			.catch((err) => processError(err, ctx));
	};

	const getHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		const authCtx = getRequestContext(ctx);

		return service
			.getExtension(authCtx, ctx.params.uuid)
			.then((r) => processEither(ctx, r))
			.catch((err) => processError(err, ctx));
	};

	const deleteHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		const authCtx = getRequestContext(ctx);

		return service
			.deleteExtension(authCtx, ctx.params.uuid)
			.then((r) => processEither(ctx, r))
			.catch((err) => processError(err, ctx));
	};

	const exportHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		const requestContext = getRequestContext(ctx);
		const uuid = ctx.params.uuid;

		return Promise.all([
			service.getExtension(requestContext, uuid),
			service.exportExtension(requestContext, uuid),
		])
			.then(([node, blob]) => {
				if (node.isLeft()) {
					return processError(node.value, ctx);
				}

				if (blob.isLeft()) {
					return processError(blob.value, ctx);
				}

				ctx.response.headers.set("Content-Type", "application/javascript");
				ctx.response.headers.set("Content-length", blob.value.size.toString());
				ctx.response.headers.set(
					"Content-Disposition",
					`attachment; filename="${node.value.title}.js"`,
				);

				ctx.response.type = "blob";
				ctx.response.body = blob.value;
			})
			.catch((err) => processError(err, ctx));
	};

	const updateHandler = async (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		const authCtx = getRequestContext(ctx);

		const fieldsOrUndefined = await ctx.request.body({ type: "json" }).value;

		if (fieldsOrUndefined === undefined) {
			return sendInternalServerError(ctx);
		}

		return service
			.updateExtension(authCtx, ctx.params.uuid, fieldsOrUndefined)
			.then((r) => processEither(ctx, r))
			.catch((err) => processError(err, ctx));
	};

	extRouter.get("/:uuid/-/run", runHandler);
	extRouter.post("/:uuid/-/run", runHandler);

	extRouter.get("/", listHandler);
	extRouter.get("/:uuid", getHandler);
	extRouter.delete("/:uuid", deleteHandler);
	extRouter.get("/:uuid/-/export", exportHandler);

	extRouter.patch("/:uuid", updateHandler);

	return extRouter;
}

async function fromOakRequest(request: OakRequest): Promise<Request> {
	const headers = new Headers();
	for (const [key, value] of request.headers.entries()) {
		headers.set(key, value);
	}

	return new Request(request.url, {
		method: request.method,
		headers,
		body: request.hasBody ? await request.body({ type: "stream" }).value : null,
	});
}

function writeResponse(response: globalThis.Response, ctx: Context) {
	ctx.response.headers.set(
		"Content-Type",
		response.headers.get("Content-Type")!,
	);
	ctx.response.status = response.status;
	ctx.response.body = response.body;
}
