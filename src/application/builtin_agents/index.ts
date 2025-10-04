import { AgentNode } from "domain/ai/agent_node.ts";
import ragAgent from "./rag.ts";

/**
 * Built-in agents provided by the Antbox platform
 *
 * These agents are automatically seeded during tenant setup and provide
 * core functionality for knowledge discovery, content analysis, and other
 * essential ECM operations.
 */
export const builtinAgents: AgentNode[] = [
	ragAgent,
];

/**
 * Get a built-in agent by UUID
 */
export function getBuiltinAgent(uuid: string): AgentNode | undefined {
	return builtinAgents.find((agent) => agent.uuid === uuid);
}

/**
 * Get the RAG agent specifically
 */
export function getRAGAgent(): AgentNode {
	return ragAgent;
}

/**
 * Check if a UUID corresponds to a built-in agent
 */
export function isBuiltinAgent(uuid: string): boolean {
	return builtinAgents.some((agent) => agent.uuid === uuid);
}
