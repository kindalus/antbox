import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult } from "./process_service_result.ts";

// ============================================================================
// ACTIONS HANDLERS
// ============================================================================

export function listActionsHandler(tenants: AntboxTenant[]): HttpHandler {
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
				.listActions(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function runActionHandler(tenants: AntboxTenant[]): HttpHandler {
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
			if (!body?.uuids || !Array.isArray(body.uuids)) {
				return new Response(
					JSON.stringify({ error: "{ uuids } array not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return service
				.runAction(
					getAuthenticationContext(req),
					params.uuid,
					body.uuids,
					body.parameters || {},
				)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
