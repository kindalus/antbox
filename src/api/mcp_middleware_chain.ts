import { type AntboxTenant } from "./antbox_tenant.ts";
import { authenticationMiddleware } from "./authentication_middleware.ts";
import type { HttpHandler } from "./handler.ts";
import {
	requireAuthenticatedPrincipalMiddleware,
	requireBearerTokenMiddleware,
} from "./mcp_authentication_middleware.ts";
import { chain, corsMiddleware, logMiddleware } from "./middleware.ts";

/**
 * Builds the middleware chain for MCP endpoint requests.
 *
 * Differences from the default API middleware:
 * - requires Authorization: Bearer <jwt>
 * - explicitly rejects anonymous principals after auth processing
 */
export function mcpMiddlewareChain(
	tenants: AntboxTenant[],
	h: HttpHandler,
): HttpHandler {
	return chain(
		h,
		corsMiddleware,
		requireBearerTokenMiddleware,
		authenticationMiddleware(tenants),
		requireAuthenticatedPrincipalMiddleware,
		logMiddleware,
	);
}
