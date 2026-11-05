import { type Context, Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { adapt } from "./adapt.ts";
import {
	copyHandler,
	deleteHandler,
	getHandler,
	lockHandler,
	mkcolHandler,
	moveHandler,
	optionsHandler,
	propfindHandler,
	putHandler,
	unlockHandler,
} from "integration/webdav/webdav_handlers.ts";

/**
 * Builds the WebDAV router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 *
 * @example
 * const router = webdavRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const handlers: Record<string, (ctx: Context) => Promise<Response>> = {
		OPTIONS: adapt(optionsHandler(tenants)),
		PROPFIND: adapt(propfindHandler(tenants)),
		GET: adapt(getHandler(tenants)),
		PUT: adapt(putHandler(tenants)),
		DELETE: adapt(deleteHandler(tenants)),
		MKCOL: adapt(mkcolHandler(tenants)),
		COPY: adapt(copyHandler(tenants)),
		MOVE: adapt(moveHandler(tenants)),
		LOCK: adapt(lockHandler(tenants)),
		UNLOCK: adapt(unlockHandler(tenants)),
	};

	const router = new Hono().basePath("/webdav");

	// HEAD is dispatched as GET by Hono, and the handler still sees method HEAD.
	router.on(
		Object.keys(handlers),
		"/*",
		(ctx) => handlers[ctx.req.method === "HEAD" ? "GET" : ctx.req.method](ctx),
	);

	return router;
}
