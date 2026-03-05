import { Router } from "@oak/oak";
import { mcpHttpHandler } from "adapters/mcp/mcp_http_handler.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the MCP router for the Oak HTTP adapter.
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/mcp" });

	router.post("/", adapt(mcpHttpHandler(tenants)));

	return router;
}
