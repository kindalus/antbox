import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getQuery } from "api/get_query.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceResult } from "api/process_service_result.ts";

export function getHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).featureService;
		const params = getParams(req);
		if (!params.uuid) {
			return Promise.resolve(
				new Response("{ uuid } not given", { status: 400 }),
			);
		}

		return service
			.export(getAuthenticationContext(req), params.uuid)
			.then(processServiceResult)
			.catch(processError);
	});
}

export function listHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;

			return service
				.listFeatures(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listActionsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;

			return service
				.listActions(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listExtsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;

			return service
				.listExtensions()
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;
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
	return defaultMiddlewareChain(tenants, (req: Request): Promise<Response> => {
		const service = getTenant(req, tenants).featureService;
		const params = getParams(req);
		const query = getQuery(req);

		if (!params.uuid) {
			return Promise.resolve(
				new Response("{ uuid } not given", { status: 400 }),
			);
		}

		const exportType = query.type || "feature"; // Default to full feature export

		return service
			.exportFeatureForType(
				getAuthenticationContext(req),
				params.uuid,
				exportType,
			)
			.then((result: any) => {
				if (result.isLeft()) {
					return processError(result.value);
				}

				const file = result.value;
				const response = new Response(file);
				response.headers.set("Content-Type", "application/javascript");
				response.headers.set("Content-Length", file.size.toString());
				response.headers.set(
					"Content-Disposition",
					`attachment; filename="${params.uuid}_${exportType}.js"`,
				);
				return response;
			})
			.catch(processError);
	});
}

export function runActionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;
			const params = getParams(req);
			const query = getQuery(req);

			if (!params.uuid) {
				return Promise.reject(new Error("{ uuid } not given"));
			}

			if (!query.uuids) {
				return Promise.reject(new Error("Missing uuids query parameter"));
			}

			const uuids = query.uuids.split(",");
			return service
				.runAction(getAuthenticationContext(req), params.uuid, uuids, query)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function runExtHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).featureService;
			const params = getParams(req);

			if (!params.uuid) {
				return Promise.reject(new Error("{ uuid } not given"));
			}

			let parameters: Record<string, unknown> = {};

			if (req.method === "GET") {
				// Extract parameters from query string
				parameters = getQuery(req);
			} else if (req.method === "POST") {
				// Extract parameters from form URL encoded body
				try {
					const contentType = req.headers.get("content-type") || "";
					if (contentType.includes("application/x-www-form-urlencoded")) {
						const formData = await req.formData();
						for (const [key, value] of formData.entries()) {
							parameters[key] = value;
						}
					} else if (contentType.includes("application/json")) {
						parameters = await req.json();
					} else {
						return new Response("Unsupported content type", { status: 400 });
					}
				} catch (_error) {
					return new Response("Invalid request body", { status: 400 });
				}
			} else {
				return new Response("Method not allowed", { status: 405 });
			}

			return service
				.runExtension(params.uuid, req, parameters)
				.then((result) => {
					if (result.isLeft()) {
						const error = result.value;
						if (error instanceof Error && !("errorCode" in error)) {
							return new Response(error.message, { status: 500 });
						}
						return processError(error as any);
					}
					return result.value;
				})
				.catch(processError);
		},
	);
}
