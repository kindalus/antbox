import { NodeMetadata } from "domain/nodes/node_metadata.ts";

/**
 * Data Transfer Object for Agent API operations
 * Represents agent metadata in a format suitable for API communication
 */
export interface AgentDTO {
	readonly uuid: string;
	readonly title: string;
	readonly description?: string;
	readonly owner: string;
	readonly created: string;
	readonly updated: string;
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
export function nodeMetadataToAgentDTO(metadata: NodeMetadata): AgentDTO {
	return {
		uuid: metadata.uuid!,
		title: metadata.title!,
		description: metadata.description,
		owner: metadata.owner!,
		created: metadata.createdTime || new Date().toISOString(),
		updated: metadata.modifiedTime || new Date().toISOString(),
		model: metadata.model as string,
		temperature: metadata.temperature as number,
		maxTokens: metadata.maxTokens as number,
		reasoning: metadata.reasoning as boolean,
		useTools: metadata.useTools as boolean,
		systemInstructions: metadata.systemInstructions as string,
		structuredAnswer: metadata.structuredAnswer as string | undefined,
	};
}
