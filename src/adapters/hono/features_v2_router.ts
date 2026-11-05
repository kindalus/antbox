import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createOrReplaceHandler,
	deleteFeatureHandler,
	exportFeatureHandler,
	getFeatureHandler,
	listFeaturesHandler,
} from "api/features_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the features router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = featuresRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/features");

	// CRUD operations
	router.post("/-/upload", adapt(createOrReplaceHandler(tenants)));
	router.get("/", adapt(listFeaturesHandler(tenants)));
	router.get("/:uuid", adapt(getFeatureHandler(tenants)));

	router.delete("/:uuid", adapt(deleteFeatureHandler(tenants)));

	// Special operations
	router.get("/:uuid/-/export", adapt(exportFeatureHandler(tenants)));

	return router;
}
