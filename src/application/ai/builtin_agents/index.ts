import type { AgentData } from "domain/configuration/agent_data.ts";
import { ragAgent } from "./rag_agent.ts";
import { RAG_NODE_FILTERING_AGENT } from "./rag_node_filtering_agent_agent.ts";
import { SEMANTIC_SEARCHER_AGENT } from "./semantic_searcher_agent.ts";
import { RAG_SUMMARIZER_AGENT } from "./rag_summarizer_agent.ts";
import { ASPECT_FIELD_EXTRACTOR_AGENT } from "./aspect_field_extractor_agent.ts";

export { ragAgent } from "./rag_agent.ts";
export { RAG_AGENT_UUID } from "./rag_agent.ts";
export {
	RAG_NODE_FILTERING_AGENT,
	RAG_NODE_FILTERING_AGENT_UUID,
} from "./rag_node_filtering_agent_agent.ts";
export {
	SEMANTIC_SEARCHER_AGENT,
	SEMANTIC_SEARCHER_AGENT_UUID,
} from "./semantic_searcher_agent.ts";
export { RAG_SUMMARIZER_AGENT, RAG_SUMMARIZER_AGENT_UUID } from "./rag_summarizer_agent.ts";
export {
	ASPECT_FIELD_EXTRACTOR_AGENT,
	ASPECT_FIELD_EXTRACTOR_AGENT_UUID,
} from "./aspect_field_extractor_agent.ts";

export const builtinAgents: AgentData[] = [
	ragAgent,
	SEMANTIC_SEARCHER_AGENT,
	RAG_NODE_FILTERING_AGENT,
	RAG_SUMMARIZER_AGENT,
	ASPECT_FIELD_EXTRACTOR_AGENT,
];
