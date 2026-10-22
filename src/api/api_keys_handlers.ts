import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";
import { ApiKeyDataSchema } from "domain/configuration/api_key_schema.ts";
import { parseJsonBody } from "./parse_json_body.ts";

const createApiKeySchema = ApiKeyDataSchema.omit({ uuid: true, secret: true, createdTime: true })
	.partial({ title: true, active: true });

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createApiKeyHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.apiKeysService;

			const unavailableResponse = checkServiceAvailability(service, "API Key service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const parsed = await parseJsonBody(req, createApiKeySchema);
			if (parsed.isLeft()) return processError(parsed.value);
			const body = parsed.value;

			return service
				.createApiKey(getAuthenticationContext(req), {
					title: body.title || "API Key",
					group: body.group,
					description: body.description,
					active: body.active ?? true,
				})
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
			const service = tenant.apiKeysService;

			const unavailableResponse = checkServiceAvailability(service, "API Key service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return service
				.getApiKey(getAuthenticationContext(req), params.uuid)
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
			const service = tenant.apiKeysService;

			const unavailableResponse = checkServiceAvailability(service, "API Key service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			return service
				.listApiKeys(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteApiKeyHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.apiKeysService;

			const unavailableResponse = checkServiceAvailability(service, "API Key service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return service
				.deleteApiKey(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
