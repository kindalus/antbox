import { fileResponse } from "shared/file_response.ts";
import { NodeFiltersSchema } from "domain/nodes/node_filter.ts";
import { z } from "zod";
import { ExportAllRequestSchema } from "application/nodes/node_export_all.ts";
import { AntboxError, BadRequestError, UnknownError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";
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

					return fileResponse(blob.value, {
						"Content-Type": node.value.mimetype!,
						"X-Content-Type-Options": "nosniff",
						"Content-Security-Policy":
							"sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
						"Cache-Control": "no-store",
					});
				})
				.catch(processError);
		},
	);
}

/** Serves GET and HEAD: the router sends both here, and HEAD is used as an existence check. */
export function contentMdHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).nodeService;
			const params = getParams(req);
			if (!params.uuid) {
				return new Response("{ uuid } not given", { status: 400 });
			}

			const response = await service
				.getContentMd(getAuthenticationContext(req), params.uuid)
				.then(contentMdResponse)
				.catch(processError);

			return req.method === "HEAD" ? new Response(null, response) : response;
		},
	);
}

function contentMdResponse(contentOrErr: Either<AntboxError, string>): Response {
	if (contentOrErr.isLeft()) {
		// Indexing and permission changes can alter this answer, so it must not be cached.
		const error = processError(contentOrErr.value);
		error.headers.set("Cache-Control", "no-store");
		return error;
	}

	const bytes = new TextEncoder().encode(contentOrErr.value);
	return new Response(bytes, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Content-Length": bytes.length.toString(),
			"X-Content-Type-Options": "nosniff",
			"Cache-Control": "no-store",
		},
	});
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
			return await fileResponse(result.value, {
				"Content-Type": "application/zip",
				"Content-Disposition": 'attachment; filename="antbox-export.zip"',
				"Cache-Control": "no-store",
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
