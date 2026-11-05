import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getTemplateHandler, listTemplatesHandler } from "api/templates_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the templates router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - The process needs permission to bind the HTTP port.
 *
 * @example
 * const router = templatesRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/templates");

	// Templates operations
	router.get("/", adapt(listTemplatesHandler(tenants)));
	router.get("/:uuid", adapt(getTemplateHandler(tenants)));

	return router;
}
