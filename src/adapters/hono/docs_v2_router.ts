import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { apiExplorerHandler, getDocHandler, listDocsHandler } from "api/docs_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the docs router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = docsRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/docs");

	// Docs operations
	router.get("/", adapt(listDocsHandler(tenants)));
	router.get("/api", adapt(apiExplorerHandler()));
	router.get("/:uuid", adapt(getDocHandler(tenants)));

	return router;
}
