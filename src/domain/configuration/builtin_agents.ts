import { builtinAgents } from "application/ai/builtin_agents/index.ts";
import { RAG_AGENT_UUID } from "application/ai/builtin_agents/rag_agent.ts";
import { ASPECT_FIELD_EXTRACTOR_AGENT_UUID } from "application/ai/builtin_agents/aspect_field_extractor_agent.ts";

export { ASPECT_FIELD_EXTRACTOR_AGENT_UUID, RAG_AGENT_UUID };

/**
 * Built-in agents available in all tenants
 * These are readonly and cannot be modified or deleted
 */
export const BUILTIN_AGENTS = builtinAgents as readonly (typeof builtinAgents[number])[];
