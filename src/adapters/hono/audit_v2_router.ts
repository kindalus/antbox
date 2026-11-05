import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getAuditLogHandler, getDeletedNodesHandler } from "api/audit_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the audit router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = auditRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]) {
	const auditRouter = new Hono().basePath("/audit");

	auditRouter.get("/:uuid", adapt(getAuditLogHandler(tenants)));
	auditRouter.get("/-/deleted", adapt(getDeletedNodesHandler(tenants)));

	return auditRouter;
}
