import { Router } from "@oak/oak";
import { listAIModelsHandler } from "api/agents_handlers.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the AI models router for the Oak HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = aiModelRouter(tenants);
 * app.use(router.routes(), router.allowedMethods());
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/ai-models" });

	// CRUD operations
	router.get("/", adapt(listAIModelsHandler(tenants)));

	return router;
}
