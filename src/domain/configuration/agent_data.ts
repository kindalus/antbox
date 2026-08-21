import type { ModelSelection } from "domain/ai/model_selection.ts";

/**
 * AgentData - Configuration data for AI agents
 * Represents agent metadata in the configuration repository
 *
 * Agents are mutable and can be updated after creation
 */

export interface AgentData {
	readonly uuid: string;
	readonly name: string;
	readonly description?: string;
	readonly exposedToUsers: boolean;
	readonly model?: ModelSelection; // Falls back to the tenant defaultModel if absent
	readonly tools?: boolean | string[]; // true = all, false/undefined/[] = load_skill only
	readonly skills?: string[]; // optional whitelist of skill names; absent = all loaded skills visible
	readonly systemPrompt?: string; // optional custom system instruction; defaults if absent
	readonly createdTime: string;
	readonly modifiedTime: string;
}
