import { type AntboxTenant } from "api/antbox_tenant.ts";
import { authenticationMiddleware } from "api/authentication_middleware.ts";
import { type HttpHandler, sendInternalServerError } from "api/handler.ts";
import { chain, HttpMiddleware, logMiddleware } from "api/middleware.ts";
import { UnknownError } from "shared/antbox_error.ts";

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
		authCheckMiddleware,
		authenticationMiddleware(tenants),
	);
}

const authCheckMiddleware: HttpMiddleware = (next: HttpHandler) => async (req: Request) => {
	const authHeader = req.headers.get("authorization");
	if (!authHeader) {
		return new Response("Unauthorized", {
			status: 401,
			headers: {
				"WWW-Authenticate": 'Basic realm="Antbox WebDAV"',
			},
		});
	}

	const basicMatch = authHeader.match(/^Basic\s+(.+)$/i);
	if (!basicMatch) {
		return sendInternalServerError(new UnknownError("Invalid authorization header"));
	}

	let decoded = "";
	try {
		decoded = atob(basicMatch[1]);
	} catch (_e) {
		return sendInternalServerError(new UnknownError(JSON.stringify(_e)));
	}

	const [user, password] = decoded.split(":");
	if (user === "jwt") {
		req.headers.set("authorization", `Bearer ${password}`);
	} else if (user === "key") {
		req.headers.set("authorization", `ApiKey ${password}`);
	} else {
		return sendInternalServerError(new UnknownError(`Invalid authentication method: ${user}`));
	}

	return next(req);
};
