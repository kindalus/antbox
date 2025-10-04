import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getQuery } from "api/get_query.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceCreateResult, processServiceResult } from "api/process_service_result.ts";

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createFeatureHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.featureService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Feature service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const formData = await req.formData();
			const file = formData.get("file") as File;
			if (!file) {
				return new Response(
					JSON.stringify({ error: "{ file } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return service
				.createOrReplace(getAuthenticationContext(req), file)
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function getFeatureHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.featureService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Feature service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return new Response(
					JSON.stringify({ error: "{ uuid } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return service
				.get(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function updateFeatureHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.featureService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Feature service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const formData = await req.formData();
			const file = formData.get("file") as File;
			if (!file) {
				return new Response(
					JSON.stringify({ error: "{ file } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return service
				.createOrReplace(getAuthenticationContext(req), file)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listFeaturesHandler(tenants: AntboxTenant[]): HttpHandler {
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

export function deleteFeatureHandler(tenants: AntboxTenant[]): HttpHandler {
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

export function exportFeatureHandler(tenants: AntboxTenant[]): HttpHandler {
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

// ============================================================================
// ACTIONS HANDLERS
// ============================================================================

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

			const body = await req.json();
			const uuids = body?.uuids || [];
			const parameters = body?.parameters || {};

			return service
				.runAction(
					getAuthenticationContext(req),
					params.uuid,
					uuids,
					parameters,
				)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

// ============================================================================
// EXTENSIONS HANDLERS
// ============================================================================

export function listExtensionsHandler(tenants: AntboxTenant[]): HttpHandler {
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

export function runExtensionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;
			const params = getParams(req);

			if (!params.uuid) {
				return Promise.reject(new Error("{ uuid } not given"));
			}

			return service
				.runExtension(getAuthenticationContext(req), params.uuid, req);
		},
	);
}

// ============================================================================
// AI TOOLS HANDLERS
// ============================================================================

export function listAIToolsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;

			return service
				.listAITools(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function runAIToolHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;
			const params = getParams(req);

			if (!params.uuid) {
				return Promise.reject(new Error("{ uuid } not given"));
			}

			const body = await req.json();
			return service
				.runAITool(getAuthenticationContext(req), params.uuid, body)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
