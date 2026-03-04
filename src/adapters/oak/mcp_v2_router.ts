import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { mcpHandler } from "api/mcp_handler.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the MCP router for the Oak HTTP adapter.
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/mcp" });

	router.post("/", adapt(mcpHandler(tenants)));

	return router;
}
