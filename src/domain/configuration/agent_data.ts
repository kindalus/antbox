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
	readonly structuredAnswer?: string;
	readonly createdTime: string;
	readonly modifiedTime: string;
}
