import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const query = getQuery(req);

			const parent = query.parent?.length > 0 ? query.parent : undefined;

			return await service
				.list(getAuthenticationContext(req), parent)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return new Response("{ uuid } not given", { status: 400 });
			}

			return await service
				.get(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function createHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const metadata = await req.json();
			if (!metadata?.mimetype) {
				return Promise.resolve(
					new Response("{ mimetype } not given", { status: 400 }),
				);
			}

			return service
				.create(getAuthenticationContext(req), metadata)
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function createFileHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const formdata = await req.formData();

			const metadataStr = formdata.get("metadata");
			const file = formdata.get("file") as File;
			let metadata: Partial<NodeMetadata>;

			try {
				metadata = JSON.parse(metadataStr as string);
			} catch (_e) {
				return Promise.resolve(
					new Response("X-Metadata header is not valid JSON", { status: 400 }),
				);
			}

			return service
				.createFile(getAuthenticationContext(req), file, metadata)
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function updateHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return new Response("{ uuid } not given", { status: 400 });
			}

			const body = await req.json();
			return await service
				.update(getAuthenticationContext(req), params.uuid, body)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function updateFileHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return new Response("{ uuid } not given", { status: 400 });
			}

			const formdata = await req.formData();
			const file = formdata.get("file") as File;
			if (!file) {
				return new Response("{ file } not given", { status: 400 });
			}

			return await service
				.updateFile(getAuthenticationContext(req), params.uuid, file)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return new Response("{ uuid } not given", { status: 400 });
			}

			return await service
				.delete(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function copyHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const body = await req.json();
			const params = getParams(req);
			if (!params.uuid) {
				return new Response("{ uuid } not given", { status: 400 });
			}

			return await service
				.copy(getAuthenticationContext(req), params.uuid, body.to)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function duplicateHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				new Response("{ uuid } not given", { status: 400 });
			}

			return await service
				.duplicate(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function findHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const body = await req.json();
			return service
				.find(
					getAuthenticationContext(req),
					body.filters,
					body.pageSize,
					body.pageToken,
				)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function evaluateHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return new Response("{ uuid } not given", { status: 400 });
			}

			return await service
				.evaluate(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

// 	});
// }

export function exportHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return new Response("{ uuid } not given", { status: 400 });
			}

			return await Promise.all([
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
					response.headers.set("Content-Type", node.value.mimetype);
					response.headers.set("Content-length", blob.value.size.toString());
					return response;
				})
				.catch(processError);
		},
	);
}

export function breadcrumbsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return await service
				.breadcrumbs(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
