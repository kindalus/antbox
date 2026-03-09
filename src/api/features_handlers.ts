import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { CreateFeatureData } from "application/features/features_service.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getTenant } from "api/get_tenant.ts";
import { getUploadFile, resolveUploadUuid } from "api/upload_utils.ts";
import {
	ACTION_UUIDS_PARAMETER_ERROR,
	hasRequiredActionUuidsParameter,
} from "domain/configuration/feature_data.ts";
import {
	featureDataToFile,
	featureToFeatureData,
	fileToUploadedFeature,
} from "domain/features/feature.ts";
import { type AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
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
			const service = tenant.featuresService;

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const featureOrErr = await parseFeatureUpload(req);
			if (featureOrErr.isLeft()) {
				return processError(featureOrErr.value);
			}

			return service
				.createFeature(getAuthenticationContext(req), featureOrErr.value)
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export async function parseFeatureUpload(
	req: Request,
): Promise<Either<AntboxError, CreateFeatureData>> {
	let formData: FormData;

	try {
		formData = await req.formData();
	} catch {
		return left(new BadRequestError("Invalid multipart/form-data body"));
	}

	const fileOrErr = getUploadFile(formData);
	if (fileOrErr.isLeft()) {
		return left(fileOrErr.value);
	}

	const module = await fileOrErr.value.text();
	if (!module.trim()) {
		return left(new BadRequestError("Feature module is required"));
	}

	const featureOrErr = await fileToUploadedFeature(
		new File([module], fileOrErr.value.name, { type: "application/javascript" }),
	);
	if (featureOrErr.isLeft()) {
		return left(featureOrErr.value);
	}

	const uuidOrErr = resolveUploadUuid(
		featureOrErr.value.uuid,
		fileOrErr.value.name,
		"_",
		"feature",
	);
	if (uuidOrErr.isLeft()) {
		return left(uuidOrErr.value);
	}

	const feature = {
		...featureOrErr.value,
		uuid: uuidOrErr.value,
	};

	if (feature.exposeAction && !hasRequiredActionUuidsParameter(feature.parameters)) {
		return left(new BadRequestError(ACTION_UUIDS_PARAMETER_ERROR));
	}

	return right(featureToFeatureData(feature));
}

export function getFeatureHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.featuresService;

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return await service
				.getFeature(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listFeaturesHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featuresService;

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
			const service = getTenant(req, tenants).featuresService;
			const params = getParams(req);

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service
				.deleteFeature(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function exportFeatureHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featuresService;
			const params = getParams(req);

			const unavailableResponse = checkServiceAvailability(service, "Feature service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			const featureOrErr = await service.getFeature(getAuthenticationContext(req), params.uuid);

			if (featureOrErr.isLeft()) {
				return processError(featureOrErr.value);
			}

			const fileOrErr = await featureDataToFile(featureOrErr.value);
			if (fileOrErr.isLeft()) {
				return processError(fileOrErr.value);
			}

			const response = new Response(fileOrErr.value);
			response.headers.set("Content-Type", fileOrErr.value.type);
			response.headers.set(
				"Content-Disposition",
				`attachment; filename="${fileOrErr.value.name}"`,
			);
			response.headers.set("Content-Length", fileOrErr.value.size.toString());
			return response;
		},
	);
}
