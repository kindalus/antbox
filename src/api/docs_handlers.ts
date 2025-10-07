import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getParams } from "./get_params.ts";
import { type HttpHandler, sendBadRequest, sendNotFound } from "./handler.ts";
import { DOCS, loadDoc } from "../../docs/index.ts";

// ============================================================================
// DOCS HANDLERS
// ============================================================================

/**
 * List all available documentation
 * GET /docs
 */
export function listDocsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (_req: Request): Promise<Response> => {
			return new Response(JSON.stringify(DOCS), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			});
		},
	);
}

/**
 * Get documentation by UUID/name
 * GET /docs/:uuid
 */
export function getDocHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			const doc = await loadDoc(params.uuid);
			if (!doc) {
				return sendNotFound({
					error: `Documentation '${params.uuid}' not found`,
				});
			}

			return new Response(doc.content, {
				status: 200,
				headers: {
					"Content-Type": doc.mimetype,
					"Content-Length": doc.content.length.toString(),
				},
			});
		},
	);
}
