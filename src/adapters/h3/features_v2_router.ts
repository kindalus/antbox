import { type AntboxTenant } from "api/antbox_tenant.ts";
import {
	deleteHandler,
	exportHandler,
	getHandler,
	listActionsHandler,
	listExtsHandler,
	listHandler,
	runActionHandler,
	runExtHandler,
} from "api/features_handlers.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = createRouter();

	// List operations
	router.get("/", adapt(listHandler(tenants))); // List all features
	router.get("/-/actions", adapt(listActionsHandler(tenants))); // List action-exposed features
	router.get("/-/extensions", adapt(listExtsHandler(tenants))); // List extension-exposed features

	// Core feature operations
	router.get("/:uuid", adapt(getHandler(tenants)));
	router.delete("/:uuid", adapt(deleteHandler(tenants)));
	router.get("/:uuid/-/export", adapt(exportHandler(tenants)));

	// Run operations
	router.get("/:uuid/-/run-action", adapt(runActionHandler(tenants))); // Run as action
	router.get("/:uuid/-/run-ext", adapt(runExtHandler(tenants))); // Run as extension (GET)
	router.post("/:uuid/-/run-ext", adapt(runExtHandler(tenants))); // Run as extension (POST)

	return router;
}
