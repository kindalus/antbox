import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { stringify as yamlStringify } from "@std/yaml";

export function toYamlMetadata(node: NodeMetadata): string {
	const filtered: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		if (value !== undefined && value !== null) {
			filtered[key] = value;
		}
	}

	return yamlStringify(filtered).trimEnd();
}

export function embeddingMarkdownBody(markdown: string): string {
	const frontmatter = markdown.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
	return (frontmatter ? markdown.slice(frontmatter[0].length) : markdown).trim();
}

export function toEmbeddingMarkdown(metadata: NodeMetadata, content = ""): string {
	const frontmatter = toYamlMetadata(metadata);
	const body = content.trim();

	if (!body) {
		return `---\n${frontmatter}\n---`;
	}

	return `---\n${frontmatter}\n---\n\n${body}`;
}
