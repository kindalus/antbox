import { AgentData } from "domain/configuration/agent_data.ts";
import { Users } from "domain/users_groups/users.ts";
import ragPrefix from "../prompts/rag_prefix.txt" with { type: "text" };
import agentSystemPrompt from "../prompts/agent_system_prompt.txt" with { type: "text" };

const ragAgentSystemPrompt = ragPrefix + "\n" + agentSystemPrompt;

/**
 * Built-in RAG (Retrieval-Augmented Generation) Agent
 *
 * Specialized agent for knowledge discovery and document retrieval within the Antbox ECM platform.
 * Optimized for semantic search, content analysis, and intelligent information synthesis.
 */
const ragAgent: AgentData = {
	uuid: "--rag-agent--",
	title: "RAG Agent",
	description:
		"Retrieval-Augmented Generation agent for knowledge discovery and document analysis within Antbox ECM",

	// Agent Configuration
	model: "default", // Uses tenant's defaultModel
	temperature: 0.7, // Balanced creativity and consistency
	maxTokens: 8192, // Sufficient for detailed responses with context
	reasoning: false, // Disabled for efficiency in retrieval tasks
	useTools: true, // Essential for search and retrieval operations

	// Optimized System Instructions for Knowledge Discovery
	systemInstructions: ragAgentSystemPrompt,

	// No structured output for flexible response format
	structuredAnswer: undefined,

	// Timestamps (will be set properly when persisted)
	createdTime: new Date().toISOString(),
	modifiedTime: new Date().toISOString(),
};

export { ragAgent };
