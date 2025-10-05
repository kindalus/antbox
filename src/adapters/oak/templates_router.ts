import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getTemplateHandler, listTemplatesHandler } from "api/templates_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/templates" });

	// Templates operations
	router.get("/", adapt(listTemplatesHandler(tenants)));
	router.get("/:uuid", adapt(getTemplateHandler(tenants)));

	return router;
}
