import { type AntboxTenant } from "api/antbox_tenant.ts";
import { authenticationMiddleware } from "api/authentication_middleware.ts";
import { type HttpHandler } from "api/handler.ts";
import { chain, HttpMiddleware, logMiddleware } from "api/middleware.ts";

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
		return new Response("Forbidden", { status: 403 });
	}

	let decoded = "";
	try {
		decoded = atob(basicMatch[1]);
	} catch (_e) {
		return new Response("Forbidden", { status: 403 });
	}

	const [user, password] = decoded.split(":");
	if (user === "jwt") {
		req.headers.set("authorization", `Bearer ${password}`);
	} else if (user === "key") {
		req.headers.set("authorization", `ApiKey ${password}`);
	} else {
		return new Response("Forbidden", { status: 403 });
	}

	return next(req);
};
