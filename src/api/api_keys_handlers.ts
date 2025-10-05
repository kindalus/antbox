import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createApiKeyHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.apiKeyService;

			const unavailableResponse = checkServiceAvailability(service, "API Key service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const body = await req.json();
			if (!body?.group) {
				return sendBadRequest({ error: "{ group } not given" });
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

			const unavailableResponse = checkServiceAvailability(service, "API Key service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
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

			const unavailableResponse = checkServiceAvailability(service, "API Key service");
			if (unavailableResponse) {
				return unavailableResponse;
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

			const unavailableResponse = checkServiceAvailability(service, "API Key service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return service
				.delete(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
