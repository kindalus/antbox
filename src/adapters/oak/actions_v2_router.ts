import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { listActionsHandler, runActionHandler } from "api/actions_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the actions router for the Oak HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = actionsRouter(tenants);
 * app.use(router.routes(), router.allowedMethods());
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/actions" });

	// Actions operations
	router.get("/", adapt(listActionsHandler(tenants)));
	router.post("/:uuid/-/run", adapt(runActionHandler(tenants)));

	return router;
}
