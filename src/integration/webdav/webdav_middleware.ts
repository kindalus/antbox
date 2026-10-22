import { type AntboxTenant } from "api/antbox_tenant.ts";
import { authenticationMiddleware } from "api/authentication_middleware.ts";
import { getAuthenticationContext } from "api/get_authentication_context.ts";
import { type HttpHandler, sendBadRequest } from "api/handler.ts";
import { chain, HttpMiddleware, logMiddleware } from "api/middleware.ts";
import { Users } from "domain/users_groups/users.ts";

/**
 * Builds the WebDAV middleware chain for HTTP handlers.
 *
 * @remarks
 * External setup:
 * - Provide configured tenants (e.g., from `setupTenants`).
 * - WebDAV clients must send Basic auth with `jwt` or `key` user prefixes.
 *
 * @example
 * const handler = webdavMiddlewareChain(tenants, webdavHandler);
 */
export function webdavMiddlewareChain(tenants: AntboxTenant[], h: HttpHandler): HttpHandler {
	return chain(
		h,
		logMiddleware,
		selectTenantMiddleware(tenants),
		authCheckMiddleware,
		authenticationMiddleware(tenants),
		(next) => (req) =>
			getAuthenticationContext(req).principal.email === Users.ANONYMOUS_USER_EMAIL
				? Promise.resolve(unauthorized())
				: next(req),
	);
}

function selectTenantMiddleware(tenants: AntboxTenant[]): HttpMiddleware {
	return (next) => (req) => {
		const url = new URL(req.url);
		let tenantName: string;
		try {
			decodeURIComponent(url.pathname);
			const segments = url.pathname.split("/");
			if (segments[1] !== "webdav" || !segments[2]) {
				return Promise.resolve(sendBadRequest("Expected /webdav/<tenant>/ path"));
			}
			tenantName = decodeURIComponent(segments[2]);
		} catch {
			return Promise.resolve(sendBadRequest("Invalid WebDAV tenant path"));
		}
		if (!tenants.some((tenant) => tenant.name === tenantName)) {
			return Promise.resolve(sendBadRequest("Tenant not found"));
		}
		const selectors = [req.headers.get("X-Tenant"), ...url.searchParams.getAll("x-tenant")];
		if (selectors.some((selector) => selector && selector !== tenantName)) {
			return Promise.resolve(sendBadRequest("Conflicting WebDAV tenant selectors"));
		}
		req.headers.set("X-Tenant", tenantName);
		return next(req);
	};
}

function unauthorized(): Response {
	return new Response("Unauthorized", {
		status: 401,
		headers: { "WWW-Authenticate": 'Basic realm="Antbox WebDAV"' },
	});
}

const authCheckMiddleware: HttpMiddleware = (next: HttpHandler) => async (req: Request) => {
	const authHeader = req.headers.get("authorization");
	const basicMatch = authHeader?.match(/^Basic\s+(.+)$/i);
	if (!basicMatch) return unauthorized();

	let decoded = "";
	try {
		decoded = atob(basicMatch[1]);
	} catch {
		return unauthorized();
	}
	if (/[\r\n\0]/.test(decoded)) return unauthorized();

	const separator = decoded.indexOf(":");
	if (separator < 0 || separator === decoded.length - 1) return unauthorized();
	const user = decoded.slice(0, separator);
	const password = decoded.slice(separator + 1);
	if (user === "jwt") {
		req.headers.set("authorization", `Bearer ${password}`);
	} else if (user === "key") {
		req.headers.set("authorization", `ApiKey ${password}`);
	} else {
		return unauthorized();
	}

	return next(req);
};
