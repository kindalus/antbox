import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { getAuditLogHandler, getDeletedNodesHandler } from "api/audit_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]) {
	const auditRouter = new Router({ prefix: "/audit" });

	auditRouter.get("/:uuid", adapt(getAuditLogHandler(tenants)));
	auditRouter.get("/-/deleted", adapt(getDeletedNodesHandler(tenants)));

	return auditRouter;
}
