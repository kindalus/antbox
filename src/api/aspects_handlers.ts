import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler, sendOK } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceResult } from "api/process_service_result.ts";
import { constants } from "node:perf_hooks";

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectService;
			return service.list(getAuthenticationContext(req)).then(sendOK);
		},
	);
}

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectService;
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

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectService;
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

export function exportHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectService;
			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(
					new Response("{ uuid } not given", { status: 400 }),
				);
			}

			return Promise.all([
				service.get(getAuthenticationContext(req), params.uuid),
				service.export(getAuthenticationContext(req), params.uuid),
			])
				.then(([node, blob]) => {
					if (node.isLeft()) {
						return processError(node.value);
					}

					if (blob.isLeft()) {
						return processError(blob.value);
					}

					const response = new Response(blob.value);
					response.headers.set("Content-Type", blob.value.type);
					response.headers.set("Content-length", blob.value.size.toString());
					return response;
				})
				.catch(processError);
		},
	);
}

export function createOrReplaceHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).aspectService;

			const formdata = await req.formData();
			const file = formdata.get("file") as File;
			let metadata;

			try {
				metadata = JSON.parse(await file.text());

				if (!metadata) {
					return new Response("Missing metadata", { status: 400 });
				}
			} catch (_error) {
				return new Response("Invalid metadata", { status: 400 });
			}

			return service
				.createOrReplace(getAuthenticationContext(req), metadata)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
