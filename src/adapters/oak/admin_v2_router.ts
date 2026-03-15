import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	adminReloadHandler,
	adminRuntimeHandler,
	adminTenantsGetHandler,
	adminTenantsUpdateHandler,
} from "api/admin_handler.ts";
import { adapt } from "./adapt.ts";

export default function (
	tenants: AntboxTenant[],
	reload: () => Promise<void>,
	configDir?: string,
): Router {
	const router = new Router({ prefix: "/admin" });
	router.get("/runtime", adapt(adminRuntimeHandler(tenants)));
	router.post("/reload", adapt(adminReloadHandler(tenants, reload)));
	router.get("/tenants", adapt(adminTenantsGetHandler(tenants, configDir)));
	router.put("/tenants", adapt(adminTenantsUpdateHandler(tenants, reload, configDir)));
	return router;
}
