import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { listExtensionsHandler, runExtensionHandler } from "api/extensions_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the extensions router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = extensionsRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/extensions");

	// Extensions operations
	router.get("/", adapt(listExtensionsHandler(tenants)));
	router.get("/:uuid", adapt(runExtensionHandler(tenants)));
	router.post("/:uuid", adapt(runExtensionHandler(tenants)));

	return router;
}
