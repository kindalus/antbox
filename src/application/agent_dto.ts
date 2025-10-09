import { AgentNode } from "domain/ai/agent_node.ts";

/**
 * Data Transfer Object for Agent API operations
 * Represents agent metadata in a format suitable for API communication
 */
export interface AgentDTO {
	readonly uuid: string;
	readonly title: string;
	readonly description?: string;
	readonly owner: string;
	readonly model: string;
	readonly temperature: number;
	readonly maxTokens: number;
	readonly reasoning: boolean;
	readonly useTools: boolean;
	readonly systemInstructions: string;
	readonly structuredAnswer?: string;
}

/**
 * Convert AgentNode metadata to AgentDTO
 */
export function toAgentDTO(node: AgentNode): AgentDTO {
	return {
		uuid: node.uuid!,
		title: node.title!,
		description: node.description,
		owner: node.owner!,
		model: node.model as string,
		temperature: node.temperature as number,
		maxTokens: node.maxTokens as number,
		reasoning: node.reasoning as boolean,
		useTools: node.useTools as boolean,
		systemInstructions: node.systemInstructions as string,
		structuredAnswer: node.structuredAnswer as string | undefined,
	};
}
