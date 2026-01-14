import type { FeatureData } from "domain/configuration/feature_data.ts";
import type { AgentsService } from "../agents_service.ts";
import type { AuthenticationContext } from "../../security/authentication_context.ts";

export type LoadSkillFunction = (skillName: string, ...resources: string[]) => Promise<string>;

/**
 * FeatureData definition for the loadSkill tool
 */
export const LOAD_SKILL_TOOL: Partial<FeatureData> = {
	uuid: "loadSkill",
	title: "loadSkill",
	description:
		"Load a skill's instructions and resources. Pass the skill name to get core instructions (Level 2), and optionally additional resource slugs to load extended content (Level 3).",
	parameters: [
		{
			name: "skillName",
			type: "string",
			required: true,
			description: "The skill identifier (e.g., 'pdf-processing')",
		},
		{
			name: "resources",
			type: "array",
			arrayType: "string",
			required: false,
			description:
				"Optional resource slugs to load (e.g., 'form-filling', 'reference'). Resource slugs are derived from H2 section titles in kebab-case.",
		},
	],
	returnType: "string",
};

/**
 * Factory function that creates a loadSkill tool with bound agents service.
 *
 * @param agentsService - The agents service to load skills from
 * @param authContext - The authentication context for authorization
 * @returns A function that loads skill content
 */
export function createLoadSkillTool(
	agentsService: AgentsService,
	authContext: AuthenticationContext,
): LoadSkillFunction {
	return async function loadSkill(skillName: string, ...resources: string[]): Promise<string> {
		const result = await agentsService.loadSkill(authContext, skillName, ...resources);

		if (result.isLeft()) {
			return `Error loading skill '${skillName}': ${result.value.message}`;
		}

		return result.value;
	};
}
