import { z } from "zod";
import { parseJsonBody } from "./parse_json_body.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceCreateResult, processServiceResult } from "api/process_service_result.ts";
import { checkServiceAvailability } from "api/service_availability.ts";

const preferencesRequestSchema = z.object({ preferences: z.record(z.string(), z.unknown()) });

export function createUserPreferencesHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const tenant = getTenant(req, tenants);
		const service = tenant.userPreferencesService;

		const unavailableResponse = checkServiceAvailability(service, "User preferences service");
		if (unavailableResponse) {
			return Promise.resolve(unavailableResponse);
		}

		const parsed = await parseJsonBody(req, preferencesRequestSchema);
		if (parsed.isLeft()) return processError(parsed.value);
		const { preferences } = parsed.value;

		return service
			.createUserPreferences(getAuthenticationContext(req), { preferences })
			.then(processServiceCreateResult)
			.catch(processError);
	});
}

export function getUserPreferencesHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const tenant = getTenant(req, tenants);
		const service = tenant.userPreferencesService;

		const unavailableResponse = checkServiceAvailability(service, "User preferences service");
		if (unavailableResponse) {
			return Promise.resolve(unavailableResponse);
		}

		return service
			.getUserPreferences(getAuthenticationContext(req))
			.then(processServiceResult)
			.catch(processError);
	});
}

export function updateUserPreferencesHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const tenant = getTenant(req, tenants);
		const service = tenant.userPreferencesService;

		const unavailableResponse = checkServiceAvailability(service, "User preferences service");
		if (unavailableResponse) {
			return Promise.resolve(unavailableResponse);
		}

		const parsed = await parseJsonBody(req, preferencesRequestSchema);
		if (parsed.isLeft()) return processError(parsed.value);
		const { preferences } = parsed.value;

		return service
			.updateUserPreferences(getAuthenticationContext(req), { preferences })
			.then(processServiceResult)
			.catch(processError);
	});
}

export function deleteUserPreferencesHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const tenant = getTenant(req, tenants);
		const service = tenant.userPreferencesService;

		const unavailableResponse = checkServiceAvailability(service, "User preferences service");
		if (unavailableResponse) {
			return Promise.resolve(unavailableResponse);
		}

		return service
			.deleteUserPreferences(getAuthenticationContext(req))
			.then(processServiceResult)
			.catch(processError);
	});
}

export function getPreferenceHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const tenant = getTenant(req, tenants);
		const service = tenant.userPreferencesService;

		const unavailableResponse = checkServiceAvailability(service, "User preferences service");
		if (unavailableResponse) {
			return Promise.resolve(unavailableResponse);
		}

		const params = getParams(req);
		if (!params.key) {
			return sendBadRequest({ error: "{ key } not given" });
		}

		return service
			.getPreference(getAuthenticationContext(req), params.key)
			.then(processServiceResult)
			.catch(processError);
	});
}
