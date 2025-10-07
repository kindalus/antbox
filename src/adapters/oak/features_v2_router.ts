import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createOrReplaceHandler,
	deleteFeatureHandler,
	exportFeatureHandler,
	getFeatureHandler,
	listFeaturesHandler,
} from "api/features_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/features" });

	// CRUD operations
	router.post("/-/upload", adapt(createOrReplaceHandler(tenants)));
	router.get("/", adapt(listFeaturesHandler(tenants)));
	router.get("/:uuid", adapt(getFeatureHandler(tenants)));

	router.delete("/:uuid", adapt(deleteFeatureHandler(tenants)));

	// Special operations
	router.get("/:uuid/-/export", adapt(exportFeatureHandler(tenants)));

	return router;
}
