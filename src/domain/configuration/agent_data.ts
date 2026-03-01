/**
 * AgentData - Configuration data for AI agents
 * Represents agent metadata in the configuration repository
 *
 * Agents are mutable and can be updated after creation
 */

export type AgentType = "llm" | "sequential" | "parallel" | "loop";

export interface AgentData {
	readonly uuid: string;
	readonly name: string;
	readonly description?: string;
	readonly type?: AgentType; // default: "llm"

	// LLM-only fields
	readonly model?: string; // ADK model string; falls back to defaultModel if absent
	readonly tools?: string[]; // named tools to inject (absent = all; [] = none)
	readonly systemPrompt?: string; // the system instruction

	// Workflow-only fields
	readonly agents?: string[]; // sub-agent UUIDs in execution order

	readonly createdTime: string;
	readonly modifiedTime: string;
}
