import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createOrReplaceHandler,
	deleteHandler,
	getHandler,
	getLocalizedByFidHandler,
	getLocalizedHandler,
	listHandler,
	renderByFidHandler,
	renderHandler,
} from "api/articles_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the articles router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - The process needs permission to bind the HTTP port.
 *
 * @example
 * const router = articlesRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]) {
	const articlesRouter = new Hono().basePath("/articles");

	articlesRouter.get("/", adapt(listHandler(tenants)));
	articlesRouter.post("/", adapt(createOrReplaceHandler(tenants)));
	articlesRouter.get("/:uuid", adapt(getHandler(tenants)));
	articlesRouter.get("/:uuid/-/localized", adapt(getLocalizedHandler(tenants)));
	articlesRouter.get("/:uuid/-/render", adapt(renderHandler(tenants)));
	articlesRouter.get("/-/fid/:fid", adapt(getLocalizedByFidHandler(tenants)));
	articlesRouter.get("/-/fid/:fid/render", adapt(renderByFidHandler(tenants)));
	articlesRouter.delete("/:uuid", adapt(deleteHandler(tenants)));

	return articlesRouter;
}
