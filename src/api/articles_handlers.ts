import { z } from "zod";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Either } from "shared/either.ts";
import type { RenderedArticle } from "application/articles/article_service.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler, sendOK } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceResult } from "api/process_service_result.ts";
import { getUploadFile, getUploadFormData } from "./upload_utils.ts";

const articleUploadSchema = z.looseObject({ uuid: z.string().optional() });

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

export function renderHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).articleService;
			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(new Response("{ uuid } not given", { status: 400 }));
			}

			const url = new URL(req.url);
			const locale = url.searchParams.get("locale") || "pt";
			const format = url.searchParams.get("format") || "html";

			return service.render(getAuthenticationContext(req), params.uuid, locale, format)
				.then(processRenderedArticle)
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

export function renderByFidHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).articleService;
			const params = getParams(req);
			if (!params.fid) {
				return Promise.resolve(new Response("{ fid } not given", { status: 400 }));
			}

			const url = new URL(req.url);
			const locale = url.searchParams.get("locale") || "pt";
			const format = url.searchParams.get("format") || "html";

			return service.renderByFid(getAuthenticationContext(req), params.fid, locale, format)
				.then(processRenderedArticle)
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

function processRenderedArticle(
	resultOrErr: Either<AntboxError, RenderedArticle>,
): Response {
	if (resultOrErr.isLeft()) {
		return processError(resultOrErr.value);
	}

	return new Response(resultOrErr.value.content, {
		status: 200,
		headers: {
			"Content-Type": resultOrErr.value.contentType,
			"X-Content-Type-Options": "nosniff",
		},
	});
}

export function createOrReplaceHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).articleService;

			const formdata = await getUploadFormData(req);
			if (formdata.isLeft()) return processError(formdata.value);
			const uploaded = getUploadFile(formdata.value);
			if (uploaded.isLeft()) return processError(uploaded.value);
			const file = uploaded.value;
			let raw: unknown;

			try {
				raw = JSON.parse(await file.text());
			} catch {
				return new Response("Invalid metadata", { status: 400 });
			}
			const parsed = articleUploadSchema.safeParse(raw);
			if (!parsed.success) return new Response("Invalid metadata", { status: 400 });
			const metadata = parsed.data;

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
