import { NodeFiltersSchema } from "domain/nodes/node_filter.ts";
import { z } from "zod";
import { ExportAllRequestSchema } from "application/nodes/node_export_all.ts";
import { AntboxError, BadRequestError, UnknownError } from "shared/antbox_error.ts";
import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { parseJsonBody } from "./parse_json_body.ts";
import { getUploadFile, getUploadFormData } from "./upload_utils.ts";

const metadataSchema = z.looseObject({});
const findRequestSchema = z.object({
	filters: z.union([z.string(), NodeFiltersSchema]),
	pageSize: z.number().int().min(1).max(200).default(20),
	pageToken: z.number().int().positive().default(1),
});
const copyRequestSchema = z.object({ to: z.string().min(1) });

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
			const body = await parseJsonBody(req, metadataSchema);
			if (body.isLeft()) return processError(body.value);
			const metadata = body.value;

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
			const form = await getUploadFormData(req);
			if (form.isLeft()) return processError(form.value);
			const file = getUploadFile(form.value);
			if (file.isLeft()) return processError(file.value);
			const metadataStr = form.value.get("metadata");
			let metadata: unknown;

			try {
				if (typeof metadataStr !== "string") throw new Error("Missing metadata");
				metadata = JSON.parse(metadataStr);
			} catch (_e) {
				return sendBadRequest({ error: "{ metadata } form field must contain a JSON object" });
			}
			const parsed = metadataSchema.safeParse(metadata);
			if (!parsed.success) {
				return sendBadRequest({ error: "{ metadata } must be a JSON object" });
			}

			return service
				.createFile(getAuthenticationContext(req), file.value, parsed.data)
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

			const body = await parseJsonBody(req, metadataSchema);
			if (body.isLeft()) return processError(body.value);
			return await service
				.update(getAuthenticationContext(req), params.uuid, body.value)
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

			const form = await getUploadFormData(req);
			if (form.isLeft()) return processError(form.value);
			const file = getUploadFile(form.value);
			if (file.isLeft()) return processError(file.value);

			return await service
				.updateFile(getAuthenticationContext(req), params.uuid, file.value)
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
			const body = await parseJsonBody(req, copyRequestSchema);
			if (body.isLeft()) return processError(body.value);
			const params = getParams(req);
			if (!params.uuid) {
				return new Response("{ uuid } not given", { status: 400 });
			}

			return await service
				.copy(getAuthenticationContext(req), params.uuid, body.value.to)
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
				return new Response("{ uuid } not given", { status: 400 });
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
			const parsed = await parseJsonBody(req, findRequestSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			const body = parsed.value;
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
					response.headers.set("Content-Type", node.value.mimetype!);
					response.headers.set("Content-length", blob.value.size.toString());
					response.headers.set("X-Content-Type-Options", "nosniff");
					response.headers.set(
						"Content-Security-Policy",
						"sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
					);
					response.headers.set("Cache-Control", "no-store");
					return response;
				})
				.catch(processError);
		},
	);
}

export function exportAllHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(tenants, async (req: Request): Promise<Response> => {
		if (
			req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
		) {
			return processError(new BadRequestError("Content-Type must be application/json"));
		}

		let body: unknown;
		try {
			body = await req.json();
		} catch {
			return processError(new BadRequestError("Invalid JSON body"));
		}
		const validation = ExportAllRequestSchema.safeParse(body);
		if (!validation.success) {
			return processError(
				new BadRequestError(
					validation.error.issues.map((issue) => issue.message).join("; "),
				),
			);
		}

		try {
			const service = getTenant(req, tenants).nodeService;
			const result = await service.exportAll(
				getAuthenticationContext(req),
				validation.data.uuids,
			);
			if (result.isLeft()) return processError(result.value);
			return new Response(result.value, {
				headers: {
					"Content-Type": "application/zip",
					"Content-Disposition": 'attachment; filename="antbox-export.zip"',
					"Content-Length": String(result.value.size),
					"Cache-Control": "no-store",
				},
			});
		} catch (error) {
			return processError(
				error instanceof AntboxError ? error : new UnknownError("Failed to export files"),
			);
		}
	});
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

export function lockHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return await service
				.lock(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function unlockHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return await service
				.unlock(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
