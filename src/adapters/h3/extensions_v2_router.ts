import { type AntboxTenant } from "api/antbox_tenant.ts";
import { listExtensionsHandler, runExtensionHandler } from "api/extensions_handlers.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = createRouter();

	// Extensions operations
	router.get("/", adapt(listExtensionsHandler(tenants)));
	router.post("/:uuid/-/exec", adapt(runExtensionHandler(tenants)));

	return router;
}
