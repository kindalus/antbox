import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getParams } from "./get_params.ts";
import { type HttpHandler, sendBadRequest, sendNotFound } from "./handler.ts";
import { DOCS, loadDoc } from "../../docs/index.ts";

// ============================================================================
// OPENAPI / DOCS EXPLORER HANDLERS
// ============================================================================

/**
 * Serves the raw OpenAPI spec file.
 * GET /openapi.yaml  (mounted outside /v2)
 */
export function openapiSpecHandler(specPath: string): HttpHandler {
	return async (_req: Request): Promise<Response> => {
		const text = await Deno.readTextFile(specPath);
		return new Response(text, {
			status: 200,
			headers: { "Content-Type": "application/yaml" },
		});
	};
}

/**
 * Serves a Scalar UI HTML page pointing at /openapi.yaml.
 * GET /v2/docs/api
 */
export function apiExplorerHandler(): HttpHandler {
	const html = `<!doctype html>
<html>
  <head>
    <title>Antbox API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.yaml"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
	return (_req: Request): Promise<Response> =>
		Promise.resolve(
			new Response(html, {
				status: 200,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			}),
		);
}

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
