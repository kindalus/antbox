import { type AntboxTenant } from "api/antbox_tenant.ts";
import {
	createFeatureHandler,
	deleteFeatureHandler,
	exportFeatureHandler,
	getFeatureHandler,
	listFeaturesHandler,
	updateFeatureHandler,
} from "api/features_handlers.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = createRouter();

	// CRUD operations
	router.post("/", adapt(createFeatureHandler(tenants)));
	router.get("/", adapt(listFeaturesHandler(tenants)));
	router.get("/:uuid", adapt(getFeatureHandler(tenants)));
	router.put("/:uuid", adapt(updateFeatureHandler(tenants)));
	router.delete("/:uuid", adapt(deleteFeatureHandler(tenants)));

	// Special operations
	router.get("/:uuid/export", adapt(exportFeatureHandler(tenants)));

	return router;
}
