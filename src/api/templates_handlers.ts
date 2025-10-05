import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getParams } from "./get_params.ts";
import { type HttpHandler, sendBadRequest, sendNotFound } from "./handler.ts";

type ValidExtension = "ts" | "js" | "json";

// MIME type mapping
const MIMETYPES: Record<ValidExtension, string> = {
	"ts": "text/typescript",
	"js": "text/javascript",
	"json": "application/json",
};

const TEMPLATES_DIR = "./templates";

/**
 * Load template file content
 */
async function loadTemplate(uuid: string): Promise<{ content: string; mimetype: string } | null> {
	// deno-lint-ignore no-explicit-any
	let content: any, mimetype: string = "";

	for (const [ext, mime] of Object.entries(MIMETYPES)) {
		try {
			content = await import(`${TEMPLATES_DIR}/${uuid}.${ext}`, { with: { type: "text" } });
			content = content.default ? content.default : content;
			mimetype = mime;

			break;
		} catch (_error) {
			//Do nothing
		}
	}

	if (!content || content === "") {
		return null;
	}

	return {
		content,
		mimetype,
	};
}

// ============================================================================
// TEMPLATES HANDLERS
// ============================================================================

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
