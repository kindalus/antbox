import { describe, it } from "bdd";
import { expect } from "expect";
import { parse as parseYaml } from "@std/yaml";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { toEmbeddingMarkdown, toYamlMetadata } from "./node_markdown.ts";

const metadata: NodeMetadata = {
	uuid: "node-1",
	fid: "node-one",
	title: "Node One",
	description: undefined,
	mimetype: "text/plain",
	parent: "root",
	createdTime: "2026-01-01T00:00:00.000Z",
	modifiedTime: "2026-01-02T00:00:00.000Z",
	owner: "owner@example.com",
	locked: false,
	size: 0,
	tags: [],
};

describe("node markdown", () => {
	it("omits nullish metadata and preserves false, zero, and empty arrays", () => {
		const withNull = {
			...metadata,
			cdnUrl: null,
		} as unknown as NodeMetadata;

		const parsed = parseYaml(toYamlMetadata(withNull)) as Record<string, unknown>;

		expect(parsed.description).toBeUndefined();
		expect(parsed.cdnUrl).toBeUndefined();
		expect(parsed.locked).toBe(false);
		expect(parsed.size).toBe(0);
		expect(parsed.tags).toEqual([]);
	});

	it("wraps metadata in frontmatter without an empty body", () => {
		const yaml = toYamlMetadata(metadata);

		const result = toEmbeddingMarkdown(metadata);

		expect(result).toBe(`---\n${yaml}\n---`);
		expect(result.endsWith("\n\n")).toBe(false);
	});

	it("trims and separates body content from frontmatter", () => {
		const yaml = toYamlMetadata(metadata);

		const result = toEmbeddingMarkdown(metadata, "  First line\nSecond line  \n");

		expect(result).toBe(`---\n${yaml}\n---\n\nFirst line\nSecond line`);
	});
});
