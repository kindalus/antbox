import type { AgentSkillData } from "../skill_data.ts";
import { parseSkillMarkdown, toAgentSkillData } from "application/ai/skill_parser.ts";

import QUERYING_SKILL_MD from "./querying.md" with { type: "text" };

const BASE_TIME = "2024-01-01T00:00:00.000Z";

/**
 * Parses a builtin skill markdown and converts it to AgentSkillData.
 * Throws an error if parsing fails (builtin skills must be valid).
 */
function loadBuiltinSkill(markdown: string, name: string): AgentSkillData {
	const parsedOrErr = parseSkillMarkdown(markdown);
	if (parsedOrErr.isLeft()) {
		throw new Error(`Failed to parse builtin skill '${name}': ${parsedOrErr.value.message}`);
	}
	return toAgentSkillData(parsedOrErr.value, BASE_TIME, BASE_TIME);
}

/**
 * Built-in skills available in all tenants.
 * These are readonly and cannot be modified or deleted.
 */
export const BUILTIN_SKILLS: readonly AgentSkillData[] = [
	loadBuiltinSkill(QUERYING_SKILL_MD, "querying"),
];
