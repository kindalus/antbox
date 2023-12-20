import { Context, Router, Status } from "../../../deps.ts";
import { AntboxError } from "../../shared/antbox_error.ts";
import { Either } from "../../shared/either.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { getTenant } from "./get_tenant.ts";
import { processError } from "./process_error.ts";
import { sendOK } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
	const meHandler = (ctx: Context) => {
		const service = getTenant(ctx, tenants).service;

		return service
			.getMe(getRequestContext(ctx))
			.then((result) => {
				if (result.isLeft()) {
					return processError(result.value, ctx);
				}

				return sendOK(ctx, result.value);
			})
			.catch((err) => processError(err, ctx));
	};

	const listHandler = (ctx: Context) => {
		const service = getTenant(ctx, tenants).service;

		return service
			.listUsers(getRequestContext(ctx))
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
			.getUser(getRequestContext(ctx), ctx.params.uuid)
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
		const service = getTenant(ctx, tenants).service;
		const body = await ctx.request.body().value;

		return service
			.createUser(getRequestContext(ctx), body)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const updateHandler = async (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		const body = await ctx.request.body().value;

		return service
			.updateUser(getRequestContext(ctx), ctx.params.uuid, body)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const deleteHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		return service
			.deleteUser(getRequestContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const usersRouter = new Router({ prefix: "/users" });

	usersRouter.use("/me", meHandler);

	usersRouter.get("/:uuid", getHandler);

	usersRouter.get("/", listHandler);

	usersRouter.post("/", createHandler);

	usersRouter.patch("/:uuid", updateHandler);

	usersRouter.delete("/:uuid", deleteHandler);

	return usersRouter;
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
