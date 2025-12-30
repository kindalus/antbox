import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createOrReplaceHandler,
	deleteHandler,
	getHandler,
	getLocalizedByFidHandler,
	getLocalizedHandler,
	listHandler,
} from "api/articles_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the articles router for the Oak HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = articlesRouter(tenants);
 * app.use(router.routes(), router.allowedMethods());
 */
export default function (tenants: AntboxTenant[]) {
	const articlesRouter = new Router({ prefix: "/articles" });

	articlesRouter.get("/", adapt(listHandler(tenants)));
	articlesRouter.post("/", adapt(createOrReplaceHandler(tenants)));
	articlesRouter.get("/:uuid", adapt(getHandler(tenants)));
	articlesRouter.get("/:uuid/-/localized", adapt(getLocalizedHandler(tenants)));
	articlesRouter.get("/-/fid/:fid", adapt(getLocalizedByFidHandler(tenants)));
	articlesRouter.delete("/:uuid", adapt(deleteHandler(tenants)));

	return articlesRouter;
}
