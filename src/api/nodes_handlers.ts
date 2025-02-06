import { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { HttpHandler } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult } from "./process_service_result.ts";

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const query = getQuery(req);

		const parent = query.parent?.length > 0 ? query.parent : undefined;

		return service
			.list(getAuthenticationContext(req), parent)
			.then(processServiceResult)
			.catch(processError);
	});
}
export function getHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const query = getQuery(req);
		return service
			.get(getAuthenticationContext(req), query.uuid)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function createHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const metadata = await req.json();
		if (!metadata?.mimetype) {
			return Promise.resolve(new Response("{ mimetype } not given", { status: 400 }));
		}

		return service
			.create(getAuthenticationContext(req), metadata)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function updateHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const body = await req.json();
		return service
			.update(getAuthenticationContext(req), body.uuid, body)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const query = getQuery(req);
		return service
			.delete(getAuthenticationContext(req), query.uuid)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function copyHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const body = await req.json();
		return service
			.copy(getAuthenticationContext(req), body.uuid, body.to)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function duplicateHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const query = getQuery(req);
		return service
			.duplicate(getAuthenticationContext(req), query.uuid)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function findHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const body = await req.json();
		return service
			.find(getAuthenticationContext(req), body.filters, body.pageSize, body.pageToken)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function evaluateHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const query = getQuery(req);
		return service
			.evaluate(getAuthenticationContext(req), query.uuid)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function recognizeHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const query = getQuery(req);
		return service
			.recognizeText(getAuthenticationContext(req), query.uuid)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function exportHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).nodeService;
		const query = getQuery(req);
		return Promise.all([
			service.get(getAuthenticationContext(req), query.uuid),
			service.export(getAuthenticationContext(req), query.uuid),
		])
			.then(([node, blob]) => {
				if (node.isLeft()) {
					return processError(node.value);
				}

				if (blob.isLeft()) {
					return processError(blob.value);
				}

				const response = new Response(blob.value);
				response.headers.set("Content-Type", node.value.mimetype);
				response.headers.set("Content-length", blob.value.size.toString());
				return response;
			})
			.catch(processError);
	});
}

/*

export default function (tenants: AntboxTenant[]) {
	const listHandler = (ctx: Context) => {
		const service = getTenant(ctx, tenants).nodeService;
		const query = getQuery(ctx);

		const parent = query.parent?.length > 0 ? query.parent : undefined;

		return service
			.list(getAuthenticationContext(ctx), parent)
			.then((result) => {
				if (result.isLeft()) {
					return processError(result.value, ctx);
				}

				return sendOK(ctx, result.value);
			})
			.catch((err) => processError(err, ctx));
	};

	const getHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).nodeService;
		return service
			.get(getAuthenticationContext(ctx), ctx.params.uuid)
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
		const service = getTenant(ctx, tenants).nodeService;
		const uuid = ctx.params.uuid;
		const requestContext = getAuthenticationContext(ctx);

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

				ctx.response.headers.set("Content-Type", mapSystemNodeType(node.value.mimetype));
				ctx.response.headers.set("Content-length", blob.value.size.toString());

				ctx.response.type = "blob";
				ctx.response.body = blob.value;
			})
			.catch((err) => processError(err, ctx));
	};

	const createHandler = async (ctx: Context) => {
		const service = getTenant(ctx, tenants).nodeService;
		const metadata: Partial<Node> = await ctx.request.body().value;

		if (!metadata?.mimetype) {
			return Promise.resolve(sendBadRequest(ctx, "{ mimetype } not given"));
		}

		return service
			.create(getAuthenticationContext(ctx), metadata)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const updateHandler = async (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).nodeService;
		const body = await ctx.request.body().value;

		return service
			.update(getAuthenticationContext(ctx), ctx.params.uuid, body)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const deleteHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).nodeService;
		return service
			.delete(getAuthenticationContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const copyHandler = async (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).nodeService;
		const { to }: { to: string } = await ctx.request.body().value;

		return service
			.copy(getAuthenticationContext(ctx), ctx.params.uuid, to)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const duplicateHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).nodeService;
		return service
			.duplicate(getAuthenticationContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const findHandler = async (ctx: Context) => {
		const service = getTenant(ctx, tenants).nodeService;
		const { filters, pageSize, pageToken } = await ctx.request.body().value;

		return service
			.find(getAuthenticationContext(ctx), filters, pageSize, pageToken)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const evaluateHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).nodeService;
		return service
			.evaluate(getAuthenticationContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
	};

	const recognizeHandler = (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).nodeService;

		return service
			.recognizeText(getAuthenticationContext(ctx), ctx.params.uuid)
			.then((result) => processEither(ctx, result))
			.catch((err) => processError(err, ctx));
};
*/
