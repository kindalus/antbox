import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getQuery } from "api/get_query.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceResult } from "api/process_service_result.ts";

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).featureService;
		const params = getParams(req);
		if (!params.uuid) {
			return Promise.resolve(
				new Response("{ uuid } not given", { status: 400 }),
			);
		}

		return service
			.export(getAuthenticationContext(req), params.uuid)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;

			return service
				.listFeatures(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listActionsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;

			return service
				.listActions(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listExtsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;

			return service
				.listExtensions()
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;
			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(
					new Response("{ uuid } not given", { status: 400 }),
				);
			}
			return service
				.delete(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function exportHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).featureService;
		const params = getParams(req);

		if (!params.uuid) {
			return Promise.resolve(
				new Response("{ uuid } not given", { status: 400 }),
			);
		}

		return service
			.export(
				getAuthenticationContext(req),
				params.uuid,
			)
			.then((result) => {
				if (result.isLeft()) {
					return processError(result.value);
				}

				const file = result.value;
				const response = new Response(file);
				response.headers.set("Content-Type", "application/javascript");
				response.headers.set("Content-Length", file.size.toString());
				response.headers.set(
					"Content-Disposition",
					`attachment; filename="${params.uuid}.js"`,
				);
				return response;
			})
			.catch(processError);
	});
}

export function runActionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;
			const params = getParams(req);
			const query = getQuery(req);

			if (!params.uuid) {
				return Promise.reject(new Error("{ uuid } not given"));
			}

			if (!query.uuids) {
				return Promise.reject(new Error("Missing uuids query parameter"));
			}

			const uuids = query.uuids.split(",");
			return service
				.runAction(getAuthenticationContext(req), params.uuid, uuids, query)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function runExtHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;
			const params = getParams(req);

			if (!params.uuid) {
				return Promise.reject(new Error("{ uuid } not given"));
			}

			return service.runExtension(
				getAuthenticationContext(req),
				params.uuid,
				req,
			);
		},
	);
}
