import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult } from "./process_service_result.ts";

// ============================================================================
// AI TOOLS HANDLERS
// ============================================================================

export function listAIToolsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.featureService;

			if (!service) {
				return Promise.resolve(
					new Response(
						JSON.stringify({ error: "Feature service not available" }),
						{ status: 503, headers: { "Content-Type": "application/json" } },
					),
				);
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

			const body = await req.json();
			return service
				.runAITool(getAuthenticationContext(req), params.uuid, body)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
