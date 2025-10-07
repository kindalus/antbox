import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getParams } from "./get_params.ts";
import { type HttpHandler, sendBadRequest, sendNotFound } from "./handler.ts";
import { loadTemplate, TEMPLATES } from "./templates/index.ts";

// ============================================================================
// TEMPLATES HANDLERS
// ============================================================================

/**
 * List all available templates
 * GET /templates
 */
export function listTemplatesHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (_req: Request): Promise<Response> => {
			return new Response(JSON.stringify(TEMPLATES), {
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			});
		},
	);
}

/**
 * Get template by UUID/name
 * GET /templates/:uuid
 */
export function getTemplateHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			const template = await loadTemplate(params.uuid);
			if (!template) {
				return sendNotFound({
					error: `Template '${params.uuid}' not found`,
				});
			}

			return new Response(template.content, {
				status: 200,
				headers: {
					"Content-Type": template.mimetype,
					"Content-Length": template.content.length.toString(),
				},
			});
		},
	);
}
