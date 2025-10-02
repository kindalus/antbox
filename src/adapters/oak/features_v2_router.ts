import { Router } from "@oak/oak";
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
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]) {
	const featuresRouter = new Router({ prefix: "/features" });

	// List operations
	featuresRouter.get("/", adapt(listHandler(tenants))); // List all features
	featuresRouter.get("/-/actions", adapt(listActionsHandler(tenants))); // List action-exposed features
	featuresRouter.get("/-/extensions", adapt(listExtsHandler(tenants))); // List extension-exposed features

	// Core feature operations
	featuresRouter.get("/:uuid", adapt(getHandler(tenants)));
	featuresRouter.delete("/:uuid", adapt(deleteHandler(tenants)));
	featuresRouter.get("/:uuid/-/export", adapt(exportHandler(tenants)));

	// Run operations
	featuresRouter.get("/:uuid/-/run-action", adapt(runActionHandler(tenants))); // Run as action
	featuresRouter.get("/:uuid/-/run-ext", adapt(runExtHandler(tenants))); // Run as extension (GET)
	featuresRouter.post("/:uuid/-/run-ext", adapt(runExtHandler(tenants))); // Run as extension (POST)

	return featuresRouter;
}
