import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getDocHandler, listDocsHandler } from "api/docs_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/docs" });

	// Docs operations
	router.get("/", adapt(listDocsHandler(tenants)));
	router.get("/:uuid", adapt(getDocHandler(tenants)));

	return router;
}
