import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";

// ============================================================================
// AI TOOLS HANDLERS
// ============================================================================

export function listAIToolsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.featureService;

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

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
			const tenant = getTenant(req, tenants);
			const service = tenant.featureService;

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			const body = await req.json();
			return service
				.runAITool(getAuthenticationContext(req), params.uuid, body)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
