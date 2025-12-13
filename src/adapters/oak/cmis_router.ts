import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { adapt } from "./adapt.ts";
import { repositoriesHandler, repositoryHandler } from "integration/cmis/cmis_handlers.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/cmis" });

	// CMIS Browser Binding (JSON)
	router.all("/json", adapt(repositoriesHandler(tenants)));
	router.all("/json/:repoId", adapt(repositoryHandler(tenants)));

	return router;
}
