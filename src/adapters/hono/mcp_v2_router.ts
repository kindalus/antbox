import { Hono } from "hono";
import { mcpHttpHandler } from "adapters/mcp/mcp_http_handler.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import type { McpHttpOptions } from "api/http_server_configuration.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the MCP router for the Hono HTTP adapter.
 */
export default function (tenants: AntboxTenant[], options?: McpHttpOptions): Hono {
	const router = new Hono().basePath("/mcp");

	router.post("/", adapt(mcpHttpHandler(tenants, options)));

	return router;
}
