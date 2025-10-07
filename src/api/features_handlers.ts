import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceCreateResult, processServiceResult } from "api/process_service_result.ts";
import { checkServiceAvailability } from "api/service_availability.ts";

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createOrReplaceHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.featureService;

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const formdata = await req.formData();
			const file = formdata.get("file") as File;

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

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return service
				.get(getAuthenticationContext(req), params.uuid)
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

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

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

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
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

		const unavailableResponse = checkServiceAvailability(service, "Feature service");
		if (unavailableResponse) {
			return Promise.resolve(unavailableResponse);
		}

		if (!params.uuid) {
			return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
		}

		return service
			.export(getAuthenticationContext(req), params.uuid)
			.then(processServiceResult)
			.catch(processError);
	});
}
