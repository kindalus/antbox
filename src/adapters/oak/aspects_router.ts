import { Context, Router } from "../../../deps.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either } from "../../shared/either.ts";

import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { getTenant } from "./get_tenant.ts";
import { processError } from "./process_error.ts";
import { sendBadRequest, sendOK } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
	const getHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		return service
			.getAspect(getRequestContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const listHandler = (ctx: Context) => {
		const service = getTenant(ctx, tenants).service;
		return service
			.listAspects(getRequestContext(ctx))
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const exportHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		const requestContext = getRequestContext(ctx);
		const uuid = ctx.params.uuid;

		return Promise.all([
			service.getAspect(requestContext, uuid),
			service.exportAspect(requestContext, uuid),
		])
			.then(([node, blob]) => {
				if (node.isLeft()) {
					return processError(node.value, ctx);
				}

				if (blob.isLeft()) {
					return processError(blob.value, ctx);
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
			.catch((err) => processError(err, ctx));
	};

	const createOrReplaceAspect = async (ctx: Context) => {
		const service = getTenant(ctx, tenants).service;
		const authCtx = getRequestContext(ctx);

		const metadata = await ctx.request.body().value;
		if (!metadata) {
			return sendBadRequest(ctx, "Missing metadata");
		}

		return service
			.createOrReplaceAspect(authCtx, metadata)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const deleteHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		return service
			.deleteAspect(getRequestContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const aspectsRouter = new Router({ prefix: "/aspects" });

	aspectsRouter.get("/", listHandler);
	aspectsRouter.get("/:uuid", getHandler);
	aspectsRouter.post("/", createOrReplaceAspect);
	aspectsRouter.delete("/:uuid", deleteHandler);
	aspectsRouter.get("/:uuid/-/export", exportHandler);

	return aspectsRouter;
}

function processEither<L extends AntboxError, R>(
	ctx: Context,
	result: Either<L, R>,
) {
	if (result.isLeft()) {
		return processError(result.value, ctx);
	}

	return sendOK(ctx, result.value as Record<string, unknown>);
}
