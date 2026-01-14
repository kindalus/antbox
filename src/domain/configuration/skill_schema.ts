import { z } from "zod";

/**
 * Zod schema for AgentSkillData validation
 */
export const AgentSkillDataSchema = z.object({
	uuid: z.string()
		.min(1, "Skill uuid/name is required")
		.regex(
			/^[a-z][a-z0-9-]*$/,
			"Skill uuid must be in kebab-case (lowercase letters, numbers, hyphens)",
		),
	title: z.string().min(1, "Skill title is required"),
	description: z.string()
		.min(1, "Skill description is required")
		.max(500, "Description should be concise (<500 characters)"),
	content: z.string().min(1, "Skill content is required"),
	createdTime: z.string(),
	modifiedTime: z.string(),
});

/**
 * Schema for skill metadata extracted from markdown frontmatter
 */
export const SkillFrontmatterSchema = z.object({
	name: z.string()
		.min(1, "Skill name is required in frontmatter")
		.regex(
			/^[a-z][a-z0-9-]*$/,
			"Skill name must be in kebab-case",
		),
	description: z.string()
		.min(1, "Skill description is required in frontmatter")
		.max(500, "Description should be concise"),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
