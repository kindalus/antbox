import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";
import { kebabToCamelCase } from "shared/string_utils.ts";
import { parseJsonBody } from "./parse_json_body.ts";
import { z } from "zod";

const runActionSchema = z.object({
	uuids: z.array(z.string().min(1), { error: "{ uuids } array not given" }),
	parameters: z.record(z.string(), z.unknown()).default({}),
});

// ============================================================================
// ACTIONS HANDLERS
// ============================================================================
//
//

export function listActionsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.featuresService;

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
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
			const engine = tenant.featuresEngine;

			const unavailableResponse = checkServiceAvailability(engine, "Features engine");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			const body = await parseJsonBody(req, runActionSchema);
			if (body.isLeft()) return sendBadRequest({ error: body.value.message });
			const parameters = Object.fromEntries(
				Object.entries(body.value.parameters).map(([k, v]) => [kebabToCamelCase(k), v]),
			);

			return engine
				.runAction(
					getAuthenticationContext(req),
					params.uuid,
					body.value.uuids,
					parameters,
				)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
