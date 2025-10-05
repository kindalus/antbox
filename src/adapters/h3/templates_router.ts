import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getTemplateHandler } from "api/templates_handlers.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = createRouter();

	// Templates operations
	router.get("/:uuid", adapt(getTemplateHandler(tenants)));

	return router;
}
