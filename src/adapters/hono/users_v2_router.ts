import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createUserHandler,
	deleteUserHandler,
	getUserHandler,
	listUsersHandler,
	updateUserHandler,
} from "api/users_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the users router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = usersRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/users");

	// CRUD operations
	router.post("/", adapt(createUserHandler(tenants)));
	router.get("/", adapt(listUsersHandler(tenants)));
	router.get("/:email", adapt(getUserHandler(tenants)));
	router.patch("/:email", adapt(updateUserHandler(tenants)));
	router.delete("/:uuid", adapt(deleteUserHandler(tenants)));

	return router;
}
