import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler, sendOK } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceResult } from "api/process_service_result.ts";

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).articleService;
			return service.list(getAuthenticationContext(req)).then(sendOK);
		},
	);
}

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).articleService;
			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(
					new Response("{ uuid } not given", { status: 400 }),
				);
			}

			return service.get(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function getLocalizedHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).articleService;
			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(
					new Response("{ uuid } not given", { status: 400 }),
				);
			}

			const url = new URL(req.url);
			const locale = url.searchParams.get("locale") || "pt";

			return service.getLocalized(getAuthenticationContext(req), params.uuid, locale)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function getLocalizedByFidHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).articleService;
			const params = getParams(req);
			if (!params.fid) {
				return Promise.resolve(
					new Response("{ fid } not given", { status: 400 }),
				);
			}

			const url = new URL(req.url);
			const locale = url.searchParams.get("locale") || "pt";

			return service.getLocalizedByFid(getAuthenticationContext(req), params.fid, locale)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).articleService;
			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(
					new Response("{ uuid } not given", { status: 400 }),
				);
			}

			return service
				.delete(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function createOrReplaceHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).articleService;

			const formdata = await req.formData();
			const file = formdata.get("file") as File;
			let metadata;

			try {
				metadata = JSON.parse(await file.text());

				if (!metadata) {
					return new Response("Missing metadata", { status: 400 });
				}
			} catch (_error) {
				console.error(_error);
				return new Response("Invalid metadata", { status: 400 });
			}

			if (!metadata.uuid) {
				metadata.uuid = file.name.substring(0, file.name.lastIndexOf("."));
			}

			return service
				.createOrReplace(getAuthenticationContext(req), metadata)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
