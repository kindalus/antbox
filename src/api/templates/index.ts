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

const TEMPLATES_DIR = "./templates";

/**
 * Load template file content by UUID
 */
export async function loadTemplate(
	uuid: string,
): Promise<{ content: string; mimetype: string } | null> {
	// deno-lint-ignore no-explicit-any
	let content: any, mimetype: string = "";

	for (const [ext, mime] of Object.entries(MIMETYPES)) {
		try {
			content = await import(`${TEMPLATES_DIR}/${uuid}.${ext}`, {
				with: { type: "text" },
			});
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
