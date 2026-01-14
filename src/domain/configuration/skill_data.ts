/**
 * AgentSkillData - Configuration data for AI agent skills
 *
 * Skills are modular capabilities that extend AI Agent's functionality.
 * Each Skill packages instructions, metadata, and optional resources that
 * AI Agent uses automatically when relevant.
 *
 * Skills follow a progressive loading strategy:
 * - Level 1: Metadata (uuid, description) - loaded at agent startup
 * - Level 2: Core instructions (H1 + first H2 section) - loaded when skill is triggered
 * - Level 3: Extended resources (subsequent H2 sections) - loaded on-demand
 *
 * Note: Access control (which agents can use which skills) is defined in the
 * agent configuration, not in the skill itself.
 */
export interface AgentSkillData {
	/**
	 * Unique identifier for the skill (same as the skill name in kebab-case).
	 * Example: "pdf-processing"
	 */
	readonly uuid: string;

	/**
	 * Human-readable title for the skill (derived from uuid in Title Case).
	 * Example: "Pdf Processing"
	 */
	readonly title: string;

	/**
	 * Brief description for skill discovery and matching.
	 * Should be concise (<100 tokens, <70 words) as it's loaded for all skills at startup.
	 * Example: "Extract text and tables from PDF files, fill forms, merge documents."
	 */
	readonly description: string;

	/**
	 * The full markdown content of the skill (Level 2 + Level 3).
	 * Contains H1 heading, H2 sections with instructions and resources.
	 */
	readonly content: string;

	/**
	 * ISO timestamp when the skill was created.
	 */
	readonly createdTime: string;

	/**
	 * ISO timestamp when the skill was last modified.
	 */
	readonly modifiedTime: string;
}

/**
 * Metadata for skill discovery (Level 1).
 * This is the minimal information loaded at agent startup.
 */
export interface AgentSkillMetadata {
	readonly uuid: string;
	readonly description: string;
}

/**
 * Extract Level 1 metadata from a skill.
 */
export function extractSkillMetadata(skill: AgentSkillData): AgentSkillMetadata {
	return {
		uuid: skill.uuid,
		description: skill.description,
	};
}
