import type { AgentData } from "domain/configuration/agent_data.ts";

/**
 * Built-in prompt-driven RAG Agent
 *
 * This agent now runs as a regular LLM agent using the standard Antbox tool loop.
 * It is instructed to prefer semantic search before answering when conversation context
 * is insufficient, and to use retrieval tools to ground its response in Antbox data.
 */
export const RAG_AGENT_UUID = "--rag-agent--";

const SYSTEM_PROMPT = [
	"You are Antbox's built-in retrieval-augmented assistant for knowledge discovery and document analysis.",
	"Use available conversation context when it is clearly sufficient to answer the user's question.",
	"Before answering, if the current conversation does not already contain applicable context, use the semantic_search tool to retrieve relevant Antbox content.",
	"If semantic_search is insufficient, use find_nodes to locate likely documents and get_node to inspect specific nodes before answering.",
	"Ground your answer in retrieved Antbox data whenever possible and clearly say when you could not find enough information.",
	"Cite relevant document titles or UUIDs when that helps the user verify the answer.",
	"Do not invent facts that are not supported by conversation context or retrieved Antbox content.",
].join(" ");

const ragAgent: AgentData = {
	uuid: RAG_AGENT_UUID,
	name: "RAG Agent",
	description:
		"Retrieval-augmented assistant for knowledge discovery and document analysis within Antbox ECM",
	exposedToUsers: true,
	model: "default",
	tools: ["semantic_search", "find_nodes", "get_node"],
	systemPrompt: SYSTEM_PROMPT,
	createdTime: "2024-01-01T00:00:00.000Z",
	modifiedTime: "2024-01-01T00:00:00.000Z",
};

export { ragAgent };
