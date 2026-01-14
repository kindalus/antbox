/**
 * AgentData - Configuration data for AI agents
 * Represents agent metadata in the configuration repository
 *
 * Agents are mutable and can be updated after creation
 */
export interface AgentData {
	readonly uuid: string;
	readonly title: string;
	readonly description?: string;
	readonly model: string;
	readonly temperature: number;
	readonly maxTokens: number;
	readonly reasoning: boolean;
	readonly useTools: boolean;
	readonly systemInstructions: string;

	/**
	 * Whether the agent can use skills.
	 * If true and skillsAllowed is empty/undefined, the agent has access to all skills.
	 */
	readonly useSkills: boolean;

	/**
	 * Optional list of skill UUIDs (names in kebab-case) that this agent can use.
	 * If empty or undefined and useSkills is true, the agent has access to all skills.
	 */
	readonly skillsAllowed?: string[];

	readonly createdTime: string;
	readonly modifiedTime: string;
}
