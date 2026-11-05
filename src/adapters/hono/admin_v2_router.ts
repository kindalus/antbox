import { Hono } from "hono";
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
	dataDir?: string,
): Hono {
	const router = new Hono().basePath("/admin");
	router.get("/runtime", adapt(adminRuntimeHandler(tenants)));
	router.post("/reload", adapt(adminReloadHandler(tenants, reload, configDir)));
	router.get("/tenants", adapt(adminTenantsGetHandler(tenants, configDir, dataDir)));
	router.put(
		"/tenants",
		adapt(adminTenantsUpdateHandler(tenants, reload, configDir, dataDir)),
	);
	return router;
}
