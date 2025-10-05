import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getParams } from "./get_params.ts";
import { type HttpHandler, sendBadRequest, sendNotFound } from "./handler.ts";
import { join } from "path";
import { exists } from "fs";

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
	".ts": "text/typescript",
	".js": "text/javascript",
	".json": "application/json",
	".md": "text/markdown",
	".txt": "text/plain",
};

const TEMPLATES_DIR = join(import.meta.dirname || ".", "templates");

/**
 * Get MIME type from file extension
 */
function getMimeType(filename: string): string {
	const ext = filename.substring(filename.lastIndexOf("."));
	return MIME_TYPES[ext] || "text/plain";
}

/**
 * Load template file content
 */
async function loadTemplate(uuid: string): Promise<{ content: string; mimetype: string } | null> {
	// Try different extensions
	const extensions = [".ts", ".js", ".json", ".md", ".txt"];

	for (const ext of extensions) {
		const filePath = join(TEMPLATES_DIR, uuid + ext);

		if (await exists(filePath)) {
			const content = await Deno.readTextFile(filePath);
			return {
				content,
				mimetype: getMimeType(filePath),
			};
		}
	}

	return null;
}

/**
 * List all template files in directory
 */
async function listTemplateFiles(): Promise<
	Array<{ uuid: string; mimetype: string; size: number }>
> {
	const templates: Array<{ uuid: string; mimetype: string; size: number }> = [];

	try {
		for await (const entry of Deno.readDir(TEMPLATES_DIR)) {
			if (entry.isFile) {
				const ext = entry.name.substring(entry.name.lastIndexOf("."));
				if (MIME_TYPES[ext]) {
					const uuid = entry.name.substring(0, entry.name.lastIndexOf("."));
					const filePath = join(TEMPLATES_DIR, entry.name);
					const stat = await Deno.stat(filePath);

					templates.push({
						uuid,
						mimetype: getMimeType(entry.name),
						size: stat.size,
					});
				}
			}
		}
	} catch (error) {
		console.error("Error reading templates directory:", error);
	}

	return templates;
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
				const available = await listTemplateFiles();
				return sendNotFound({
					error: `Template '${params.uuid}' not found`,
					available: available.map((t) => t.uuid),
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

/**
 * List all available templates
 * GET /templates
 */
export function listTemplatesHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (_req: Request): Promise<Response> => {
			const templateList = await listTemplateFiles();

			return new Response(JSON.stringify(templateList), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		},
	);
}
