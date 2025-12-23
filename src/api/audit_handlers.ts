import type { AntboxTenant } from "api/antbox_tenant.ts";
import { defaultMiddlewareChain } from "api/default_middleware_chain.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { getParams } from "api/get_params.ts";
import { getTenant } from "api/get_tenant.ts";
import { type HttpHandler, sendOK } from "api/handler.ts";
import { processError } from "api/process_error.ts";
import { processServiceResult } from "api/process_service_result.ts";

export function getAuditLogHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).auditLoggingService;
			const params = getParams(req);

			if (!params.uuid) {
				return Promise.resolve(
					new Response("{ uuid } not given", { status: 400 }),
				);
			}

			const url = new URL(req.url);
			const mimetype = url.searchParams.get("mimetype");

			if (!mimetype) {
				return Promise.resolve(
					new Response("{ mimetype } query parameter required", { status: 400 }),
				);
			}

			return service
				.get(getAuthenticationContext(req), params.uuid, mimetype)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function getDeletedNodesHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const service = getTenant(req, tenants).auditLoggingService;
			const url = new URL(req.url);
			const mimetype = url.searchParams.get("mimetype");

			if (!mimetype) {
				return Promise.resolve(
					new Response("{ mimetype } query parameter required", { status: 400 }),
				);
			}

			return service
				.getDeleted(getAuthenticationContext(req), mimetype)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
