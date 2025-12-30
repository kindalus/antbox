import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getTemplateHandler, listTemplatesHandler } from "api/templates_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the templates router for the Oak HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = templatesRouter(tenants);
 * app.use(router.routes(), router.allowedMethods());
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/templates" });

	// Templates operations
	router.get("/", adapt(listTemplatesHandler(tenants)));
	router.get("/:uuid", adapt(getTemplateHandler(tenants)));

	return router;
}
