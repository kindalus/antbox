import { type Context, Router } from "@oak/oak";
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

export default function (tenants: AntboxTenant[]): Router {
	const handlers = {
		OPTIONS: adapt(optionsHandler(tenants)),
		PROPFIND: adapt(propfindHandler(tenants)),
		GET: adapt(getHandler(tenants)),
		HEAD: adapt(getHandler(tenants)),
		PUT: adapt(putHandler(tenants)),
		DELETE: adapt(deleteHandler(tenants)),
		MKCOL: adapt(mkcolHandler(tenants)),
		COPY: adapt(copyHandler(tenants)),
		MOVE: adapt(moveHandler(tenants)),
		LOCK: adapt(lockHandler(tenants)),
		UNLOCK: adapt(unlockHandler(tenants)),
	};

	// deno-lint-ignore no-explicit-any
	const router = new Router({ prefix: "/webdav", methods: Object.keys(handlers) as any });

	router.options("/(.*)", adapt(optionsHandler(tenants)));

	router.all("/(.*)", async (ctx: Context) => {
		const handler = handlers[ctx.request.method as keyof typeof handlers];

		if (handler) {
			return await handler(ctx);
		}

		ctx.response.status = 405;
		ctx.response.body = "Method Not Allowed";
	});

	return router;
}
