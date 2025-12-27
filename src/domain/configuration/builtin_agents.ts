import type { AgentData } from "./agent_data.ts";

const BASE_TIME = "2024-01-01T00:00:00.000Z";

/**
 * RAG Agent System Prompt
 * Specialized for knowledge discovery and document retrieval
 */
const RAG_AGENT_SYSTEM_PROMPT =
	`You are a Retrieval-Augmented Generation (RAG) agent specialized in knowledge discovery and document analysis within the Antbox ECM platform.

Your primary capabilities:
- Semantic search across documents and content
- Intelligent information synthesis from multiple sources
- Context-aware responses based on retrieved knowledge
- Document analysis and summarization

You have access to tools for searching and retrieving content. Use them effectively to provide accurate, well-sourced answers.`;

export const RAG_AGENT_UUID = "--rag-agent--";

export const RAG_AGENT: AgentData = {
	uuid: RAG_AGENT_UUID,
	title: "RAG Agent",
	description:
		"Retrieval-Augmented Generation agent for knowledge discovery and document analysis within Antbox ECM",
	model: "default",
	temperature: 0.7,
	maxTokens: 8192,
	reasoning: false,
	useTools: true,
	systemInstructions: RAG_AGENT_SYSTEM_PROMPT,
	structuredAnswer: undefined,
	createdTime: BASE_TIME,
	modifiedTime: BASE_TIME,
};

/**
 * Built-in agents available in all tenants
 * These are readonly and cannot be modified or deleted
 */
export const BUILTIN_AGENTS: readonly AgentData[] = [
	RAG_AGENT,
];
