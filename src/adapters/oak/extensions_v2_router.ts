import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { listExtensionsHandler, runExtensionHandler } from "api/extensions_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the extensions router for the Oak HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = extensionsRouter(tenants);
 * app.use(router.routes(), router.allowedMethods());
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/extensions" });

	// Extensions operations
	router.get("/", adapt(listExtensionsHandler(tenants)));
	router.get("/:uuid/-/exec", adapt(runExtensionHandler(tenants)));
	router.post("/:uuid/-/exec", adapt(runExtensionHandler(tenants)));

	return router;
}
