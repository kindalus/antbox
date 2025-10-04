import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { listActionsHandler, runActionHandler } from "api/actions_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/actions" });

	// Actions operations
	router.get("/", adapt(listActionsHandler(tenants)));
	router.post("/:uuid/run", adapt(runActionHandler(tenants)));

	return router;
}
