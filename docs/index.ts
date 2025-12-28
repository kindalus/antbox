export interface DocInfo {
	uuid: string;
	description: string;
}

export const DOCS: DocInfo[] = [
	{
		uuid: "ai-agents",
		description: "Guide to AI agents in Antbox",
	},
	{
		uuid: "authentication",
		description: "Authentication methods and usage",
	},
	{
		uuid: "architecture",
		description: "System architecture overview",
	},
	{
		uuid: "features",
		description: "Available features documentation",
	},
	{
		uuid: "getting-started",
		description: "Getting started guide",
	},
	{
		uuid: "llms",
		description: "Platform context for LLMs",
	},
	{
		uuid: "nodes-and-aspects",
		description: "Nodes and aspects explained",
	},
	{
		uuid: "storage-providers",
		description: "Storage providers documentation",
	},
];

const DOCS_DIR = "./";

/**
 * Load documentation file content by UUID
 */
export async function loadDoc(
	uuid: string,
): Promise<{ content: string; mimetype: string } | null> {
	try {
		const content = await import(`${DOCS_DIR}${uuid}.md`, {
			with: { type: "text" },
		});

		return {
			content: content.default ? content.default : content,
			mimetype: "text/markdown",
		};
	} catch (_error) {
		return null;
	}
}
