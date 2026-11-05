import fs from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface DocInfo {
	uuid: string;
	description: string;
}

export const DOCS: DocInfo[] = [
	{
		uuid: "getting-started",
		description: "Getting started guide",
	},
	{
		uuid: "tutorial-upload-to-search",
		description:
			"End-to-end tutorial for uploading, tagging, searching, and exporting a document",
	},
	{
		uuid: "architecture",
		description: "System architecture overview",
	},
	{
		uuid: "overview",
		description: "Executive overview of the Antbox platform",
	},
	{
		uuid: "product-strategy-ux-analysis",
		description: "Product strategy, positioning, roadmap, and API usability analysis",
	},
	{
		uuid: "authentication",
		description: "Authentication methods and usage",
	},
	{
		uuid: "nodes-and-aspects",
		description: "Nodes and aspects explained",
	},
	{
		uuid: "node-querying",
		description: "Query and search nodes with semantic, metadata, and aspect filters",
	},
	{
		uuid: "features",
		description: "Feature modules, actions, HTTP extensions, automatic triggers, and AI tools",
	},
	{
		uuid: "ai-agents",
		description: "Guide to AI agents in Antbox",
	},
	{
		uuid: "agent-sdk",
		description: "Agent run_code SDK reference",
	},
	{
		uuid: "agent-skills",
		description: "How agent skills work",
	},
	{
		uuid: "workflows",
		description: "Workflow definitions and instances API",
	},
	{
		uuid: "articles",
		description: "Articles API and localized content model",
	},
	{
		uuid: "templates",
		description: "Built-in code template catalog",
	},
	{
		uuid: "notifications",
		description: "Notifications API usage",
	},
	{
		uuid: "audit",
		description: "Audit log and deleted-nodes queries",
	},
	{
		uuid: "observability",
		description: "OpenTelemetry and runtime observability",
	},
	{
		uuid: "security-administration",
		description: "Users, groups, and API keys administration",
	},
	{
		uuid: "security-runtime",
		description: "Runtime isolation and container hardening",
	},
	{
		uuid: "llms",
		description: "Platform context for LLMs",
	},
	{
		uuid: "adapters",
		description: "Adapters configuration reference",
	},
	{
		uuid: "storage-providers",
		description: "Storage providers documentation",
	},
	{
		uuid: "google-drive",
		description: "Google Drive Shared Drive adapter setup guide",
	},
	{
		uuid: "webdav",
		description: "WebDAV desktop mounting guide and protocol details",
	},
	{
		uuid: "mcp",
		description: "Model Context Protocol endpoint and tool/resource catalog",
	},
	{
		uuid: "documentation-api",
		description: "Documentation discovery and retrieval endpoint",
	},
];

function isInside(directory: string, path: string): boolean {
	const rel = relative(directory, path);
	return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

const DOCS_DIR = fileURLToPath(new URL("./", import.meta.url));

function stripFrontmatter(markdown: string): string {
	const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return markdown;
	}

	return match[1].trimStart();
}

/**
 * Load documentation file content by UUID
 */
export async function loadDoc(
	uuid: string,
): Promise<{ content: string; mimetype: string } | null> {
	try {
		const path = resolve(DOCS_DIR, `${uuid}.md`);
		if (!isInside(DOCS_DIR, path)) return null;
		const markdown = await fs.readFile(path, "utf8");

		return {
			content: stripFrontmatter(markdown),
			mimetype: "text/markdown",
		};
	} catch (_error) {
		return null;
	}
}
