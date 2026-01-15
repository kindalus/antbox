import type { AntboxError } from "shared/antbox_error.ts";
import { BadRequestError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import type { AgentSkillData } from "domain/configuration/skill_data.ts";
import {
	type SkillFrontmatter,
	SkillFrontmatterSchema,
} from "domain/configuration/skill_schema.ts";
import { parse as parseYaml } from "@std/yaml";

/**
 * Result of parsing a skill markdown file
 */
export interface ParsedSkill {
	frontmatter: SkillFrontmatter;
	title: string;
	content: string;
}

/**
 * Parses a skill markdown file with YAML frontmatter.
 *
 * Expected format:
 * ```markdown
 * ---
 * name: skill-name
 * description: Skill description for discovery
 * ---
 *
 * # Skill Title
 *
 * ## Quick Start
 * ...
 * ```
 */
export function parseSkillMarkdown(markdown: string): Either<AntboxError, ParsedSkill> {
	// Check for frontmatter delimiter
	if (!markdown.startsWith("---")) {
		return left(new BadRequestError("Skill markdown must start with YAML frontmatter (---)"));
	}

	// Find the closing frontmatter delimiter
	const endIndex = markdown.indexOf("\n---", 3);
	if (endIndex === -1) {
		return left(new BadRequestError("Invalid frontmatter: missing closing delimiter (---)"));
	}

	// Extract frontmatter YAML
	const frontmatterYaml = markdown.substring(4, endIndex).trim();

	// Parse YAML
	let frontmatterData: unknown;
	try {
		frontmatterData = parseYaml(frontmatterYaml);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return left(new BadRequestError(`Invalid YAML in frontmatter: ${message}`));
	}

	// Validate frontmatter with Zod
	const validation = SkillFrontmatterSchema.safeParse(frontmatterData);
	if (!validation.success) {
		const errors = validation.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`);
		return left(new BadRequestError(`Invalid frontmatter: ${errors.join(", ")}`));
	}

	// Extract content after frontmatter
	const content = markdown.substring(endIndex + 4).trim();

	// Extract title from the H1 heading (or generate from name)
	const titleOrErr = extractTitle(content, validation.data.name);
	if (titleOrErr.isLeft()) {
		return left(titleOrErr.value);
	}

	return right({
		frontmatter: validation.data,
		title: titleOrErr.value,
		content,
	});
}

/**
 * Extracts the title from the H1 heading in the skill content.
 * Falls back to converting the skill name to Title Case.
 */
function extractTitle(content: string, name: string): Either<AntboxError, string> {
	const h1Match = content.match(/^#\s+(.+)$/m);
	if (h1Match) {
		return right(h1Match[1].trim());
	}
	// Generate title from name (kebab-case to Title Case)
	return right(toTitleCase(name));
}

/**
 * Converts kebab-case to Title Case.
 * Example: "pdf-processing" -> "Pdf Processing"
 */
function toTitleCase(kebabCase: string): string {
	return kebabCase
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * Converts a parsed skill to AgentSkillData for storage.
 * The uuid is the same as the name (kebab-case).
 * The title is derived from the name in Title Case.
 */
export function toAgentSkillData(
	parsed: ParsedSkill,
	now: string,
	existingCreatedTime?: string,
): AgentSkillData {
	return {
		uuid: parsed.frontmatter.name,
		title: toTitleCase(parsed.frontmatter.name),
		description: parsed.frontmatter.description,
		content: parsed.content,
		createdTime: existingCreatedTime ?? now,
		modifiedTime: now,
	};
}

/**
 * Converts AgentSkillData back to markdown format for export.
 */
export function toSkillMarkdown(skill: AgentSkillData): string {
	// Build YAML frontmatter
	let yaml = "";
	yaml += `name: ${skill.uuid}\n`;
	yaml += `description: ${skill.description}\n`;

	return `---\n${yaml}---\n\n${skill.content}`;
}

/**
 * Extracts Level 2 content (core instructions) from skill content.
 * This includes the H1 heading and the first H2 section.
 */
export function extractLevel2Content(content: string): string {
	const lines = content.split("\n");
	const result: string[] = [];
	let h2Count = 0;

	for (const line of lines) {
		// Check if this is an H2 heading
		if (line.match(/^##\s+/)) {
			h2Count++;
			// Stop before the second H2
			if (h2Count > 1) {
				break;
			}
		}
		result.push(line);
	}

	return result.join("\n").trim();
}

/**
 * Extracts a specific Level 3 resource section by its heading slug.
 * The slug is derived from the H2 heading (e.g., "Form Filling" -> "form-filling").
 */
export function extractLevel3Resource(content: string, resourceSlug: string): string | undefined {
	const lines = content.split("\n");
	const result: string[] = [];
	let inTargetSection = false;
	let h2Count = 0;

	for (const line of lines) {
		// Check if this is an H2 heading
		const h2Match = line.match(/^##\s+(.+)$/);
		if (h2Match) {
			h2Count++;
			// Skip the first H2 (Quick Start / Level 2)
			if (h2Count === 1) {
				continue;
			}

			// Check if this is our target section
			const headingSlug = slugify(h2Match[1]);
			if (headingSlug === resourceSlug) {
				inTargetSection = true;
				result.push(line);
				continue;
			} else if (inTargetSection) {
				// We've hit another H2, stop collecting
				break;
			}
		}

		if (inTargetSection) {
			result.push(line);
		}
	}

	if (result.length === 0) {
		return undefined;
	}

	return result.join("\n").trim();
}

/**
 * Lists all Level 3 resource sections available in the skill content.
 */
export function listLevel3Resources(content: string): string[] {
	const lines = content.split("\n");
	const resources: string[] = [];
	let h2Count = 0;

	for (const line of lines) {
		const h2Match = line.match(/^##\s+(.+)$/);
		if (h2Match) {
			h2Count++;
			// Skip the first H2 (Level 2 content)
			if (h2Count > 1) {
				resources.push(slugify(h2Match[1]));
			}
		}
	}

	return resources;
}

/**
 * Converts a heading to a URL-friendly slug.
 */
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.trim();
}
