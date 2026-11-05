import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { listActionsHandler, runActionHandler } from "api/actions_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the actions router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - The process needs permission to bind the HTTP port.
 *
 * @example
 * const router = actionsRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/actions");

	// Actions operations
	router.get("/", adapt(listActionsHandler(tenants)));
	router.post("/:uuid/-/run", adapt(runActionHandler(tenants)));

	return router;
}
