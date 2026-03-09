import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { CreateAspectData } from "application/aspects/aspects_service.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler } from "api/handler.ts";
import { getUploadFile, resolveUploadUuid } from "api/upload_utils.ts";
import { processError } from "api/process_error.ts";
import { processServiceResult } from "api/process_service_result.ts";
import { type AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectsService;
			return service.listAspects(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectsService;
			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(
					new Response("{ uuid } not given", { status: 400 }),
				);
			}

			return service.getAspect(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectsService;
			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(
					new Response("{ uuid } not given", { status: 400 }),
				);
			}

			return service
				.deleteAspect(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function exportHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectsService;
			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(
					new Response("{ uuid } not given", { status: 400 }),
				);
			}

			const fileOrErr = await service.exportAspect(getAuthenticationContext(req), params.uuid);

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

export async function parseAspectUpload(
	req: Request,
): Promise<Either<AntboxError, CreateAspectData>> {
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

	try {
		const rawPayload = JSON.parse(await fileOrErr.value.text()) as Partial<CreateAspectData>;
		if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
			return left(new BadRequestError("Aspect file must contain a JSON object"));
		}

		const uuidOrErr = resolveUploadUuid(rawPayload.uuid, fileOrErr.value.name, "-", "aspect");
		if (uuidOrErr.isLeft()) {
			return left(uuidOrErr.value);
		}

		return right({
			uuid: uuidOrErr.value,
			title: rawPayload.title ?? "",
			description: rawPayload.description,
			filters: rawPayload.filters ?? [],
			properties: rawPayload.properties ?? [],
		});
	} catch (error) {
		return left(new BadRequestError(`Failed to parse aspect: ${(error as Error).message}`));
	}
}

export function createOrReplaceHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectsService;
			const metadataOrErr = await parseAspectUpload(req);
			if (metadataOrErr.isLeft()) {
				return processError(metadataOrErr.value);
			}

			return service
				.createAspect(getAuthenticationContext(req), metadataOrErr.value)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
