import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createGroupHandler,
	deleteGroupHandler,
	getGroupHandler,
	listGroupsHandler,
} from "api/groups_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the groups router for the Oak HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = groupsRouter(tenants);
 * app.use(router.routes(), router.allowedMethods());
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/groups" });

	// CRUD operations (groups are immutable - no update endpoint)
	router.post("/", adapt(createGroupHandler(tenants)));
	router.get("/", adapt(listGroupsHandler(tenants)));
	router.get("/:uuid", adapt(getGroupHandler(tenants)));
	router.delete("/:uuid", adapt(deleteGroupHandler(tenants)));

	return router;
}
