import {
	builtinAgents,
	RAG_AGENT_UUID,
	RAG_SUMMARIZER_AGENT_UUID,
	SEMANTIC_SEARCHER_AGENT_UUID,
} from "application/ai/builtin_agents/index.ts";

export { RAG_AGENT_UUID, RAG_SUMMARIZER_AGENT_UUID, SEMANTIC_SEARCHER_AGENT_UUID };

/**
 * Built-in agents available in all tenants
 * These are readonly and cannot be modified or deleted
 */
export const BUILTIN_AGENTS = builtinAgents as readonly (typeof builtinAgents[number])[];
