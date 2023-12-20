import { Context, Router, Status } from "../../../deps.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either } from "../../shared/either.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { getTenantByContext } from "./get_tenant.ts";
import { processError } from "./process_error.ts";
import { sendOK } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
	const listHandler = (ctx: Context) => {
		const service = getTenantByContext(ctx, tenants).service;

		return service
			.listApiKeys(getRequestContext(ctx))
			.then((result) => {
				if (result.isLeft()) {
					return processError(result.value, ctx);
				}

				return sendOK(ctx, result.value);
			})
			.catch((err) => processError(err, ctx));
	};

	const getHandler = (ctx: ContextWithParams) => {
		const service = getTenantByContext(ctx, tenants).service;
		return service
			.getApiKey(getRequestContext(ctx), ctx.params.uuid)
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

	const createHandler = async (ctx: Context) => {
		const service = getTenantByContext(ctx, tenants).service;
		const body = await ctx.request.body().value;

		return service
			.createApiKey(getRequestContext(ctx), body.group, body.description)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const deleteHandler = (ctx: ContextWithParams) => {
		const service = getTenantByContext(ctx, tenants).service;
		return service
			.deleteApiKey(getRequestContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const apiKeysRouter = new Router({ prefix: "/api-keys" });

	apiKeysRouter.get("/:uuid", getHandler);

	apiKeysRouter.get("/", listHandler);

	apiKeysRouter.post("/", createHandler);

	apiKeysRouter.delete("/:uuid", deleteHandler);

	return apiKeysRouter;
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
