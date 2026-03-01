import type { AgentData } from "domain/configuration/agent_data.ts";
import {
	SEMANTIC_SEARCHER_AGENT_UUID,
} from "./semantic_searcher_agent.ts";
import { RAG_SUMMARIZER_AGENT_UUID } from "./rag_summarizer_agent.ts";

/**
 * Built-in RAG (Retrieval-Augmented Generation) Agent
 *
 * A two-stage sequential pipeline:
 * 1. Semantic Searcher — finds relevant nodes using runCode
 * 2. RAG Summarizer — synthesizes an answer from search results
 */
export const RAG_AGENT_UUID = "--rag-agent--";

const ragAgent: AgentData = {
	uuid: RAG_AGENT_UUID,
	name: "RAG Agent",
	description:
		"Retrieval-Augmented Generation agent for knowledge discovery and document analysis within Antbox ECM",
	type: "sequential",
	agents: [SEMANTIC_SEARCHER_AGENT_UUID, RAG_SUMMARIZER_AGENT_UUID],
	createdTime: "2024-01-01T00:00:00.000Z",
	modifiedTime: "2024-01-01T00:00:00.000Z",
};

export { ragAgent };
