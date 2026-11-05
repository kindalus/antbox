import fs from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface TemplateInfo {
	uuid: string;
	description: string;
}

export const TEMPLATES: TemplateInfo[] = [
	{
		uuid: "example-feature",
		description: "Template for creating custom features in Antbox",
	},
	{
		uuid: "example-action",
		description: "JavaScript action template for processing nodes",
	},
	{
		uuid: "example-config",
		description: "JSON configuration example",
	},
];

type ValidExtension = "ts" | "js" | "json";

// MIME type mapping
const MIMETYPES: Record<ValidExtension, string> = {
	"ts": "text/typescript",
	"js": "text/javascript",
	"json": "application/json",
};

const TEMPLATES_DIR = fileURLToPath(new URL("./", import.meta.url));

function isInside(directory: string, path: string): boolean {
	const rel = relative(directory, path);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Load template file content by UUID
 */
export async function loadTemplate(
	uuid: string,
): Promise<{ content: string; mimetype: string } | null> {
	let content: string | undefined, mimetype: string = "";

	for (const [ext, mime] of Object.entries(MIMETYPES)) {
		try {
			const path = resolve(TEMPLATES_DIR, `${uuid}.${ext}`);
			if (!isInside(TEMPLATES_DIR, path)) continue;
			content = await fs.readFile(path, "utf8");
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
