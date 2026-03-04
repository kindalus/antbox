import { createJsonRpcParseErrorResponse, processMcpRequest } from "adapters/mcp/mcp_server.ts";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getTenant } from "./get_tenant.ts";
import type { HttpHandler } from "./handler.ts";
import { mcpMiddlewareChain } from "./mcp_middleware_chain.ts";

export function mcpHandler(tenants: AntboxTenant[]): HttpHandler {
	return mcpMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			let payload: unknown;

			try {
				const rawBody = await req.text();
				payload = rawBody.length > 0 ? JSON.parse(rawBody) : {};
			} catch {
				return toJsonResponse(createJsonRpcParseErrorResponse());
			}

			const tenant = getTenant(req, tenants);
			const authContext = getAuthenticationContext(req);

			const response = await processMcpRequest(payload, {
				tenant: tenant.name,
				authContext,
				nodeService: tenant.nodeService,
			});

			if (!response) {
				return new Response(null, { status: 202 });
			}

			return toJsonResponse(response);
		},
	);
}

function toJsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
	});
}
