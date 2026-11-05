import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getStorageUsageHandler, getTokenUsageHandler } from "api/metrics_handlers.ts";
import { adapt } from "./adapt.ts";

export default function metricsRouter(tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/metrics");

	router.get("/storage", adapt(getStorageUsageHandler(tenants)));
	router.get("/tokens", adapt(getTokenUsageHandler(tenants)));

	return router;
}
