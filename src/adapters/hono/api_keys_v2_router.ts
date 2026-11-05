import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createApiKeyHandler,
	deleteApiKeyHandler,
	getApiKeyHandler,
	listApiKeysHandler,
} from "api/api_keys_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the API keys router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = apiKeysRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/api-keys");

	// CRUD operations
	router.post("/", adapt(createApiKeyHandler(tenants)));
	router.get("/", adapt(listApiKeysHandler(tenants)));
	router.get("/:uuid", adapt(getApiKeyHandler(tenants)));
	router.delete("/:uuid", adapt(deleteApiKeyHandler(tenants)));

	return router;
}
