import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceCreateResult, processServiceResult } from "api/process_service_result.ts";
import { checkServiceAvailability } from "api/service_availability.ts";

function getPreferencesPayload(body: unknown): Record<string, unknown> | undefined {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return undefined;
	}

	const preferences = (body as { preferences?: unknown }).preferences;
	if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
		return undefined;
	}

	return preferences as Record<string, unknown>;
}

export function createUserPreferencesHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		const tenant = getTenant(req, tenants);
		const service = tenant.userPreferencesService;

		const unavailableResponse = checkServiceAvailability(service, "User preferences service");
		if (unavailableResponse) {
			return Promise.resolve(unavailableResponse);
		}

		const body = await req.json();
		const preferences = getPreferencesPayload(body);
		if (!preferences) {
			return sendBadRequest({ error: "{ preferences } object not given" });
		}

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

		const body = await req.json();
		const preferences = getPreferencesPayload(body);
		if (!preferences) {
			return sendBadRequest({ error: "{ preferences } object not given" });
		}

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
