import { type AntboxTenant } from "api/antbox_tenant.ts";
import { type HttpHandler } from "api/handler.ts";
import { chain, corsMiddleware, logMiddleware } from "api/middleware.ts";
import { authenticationMiddleware } from "api/authentication_middleware.ts";

export function webdavMiddlewareChain(tenants: AntboxTenant[], h: HttpHandler): HttpHandler {
	return chain(
		h,
		authenticationMiddleware(tenants),
		corsMiddleware,
		logMiddleware,
	);
}
