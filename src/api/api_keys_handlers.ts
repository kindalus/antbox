import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createApiKeyHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.apiKeyService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "API Key service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const body = await req.json();
			if (!body?.group) {
				return new Response(
					JSON.stringify({ error: "{ group } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return service
				.create(getAuthenticationContext(req), body.group, body.description)
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function getApiKeyHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.apiKeyService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "API Key service not available" }),
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
				.get(params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listApiKeysHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.apiKeyService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "API Key service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const apiKeys = await service.list(getAuthenticationContext(req));
			return new Response(JSON.stringify(apiKeys), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		},
	);
}

export function deleteApiKeyHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.apiKeyService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "API Key service not available" }),
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
				.delete(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
