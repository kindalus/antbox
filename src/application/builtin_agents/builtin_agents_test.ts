import { beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import { builtinAgents, getBuiltinAgent, getRAGAgent, isBuiltinAgent } from "./index.ts";
import ragAgent from "./rag.ts";
import { AgentNode } from "domain/ai/agent_node.ts";
import { Users } from "domain/users_groups/users.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Folders } from "domain/nodes/folders.ts";

describe("Builtin Agents", () => {
	describe("builtinAgents array", () => {
		it("should contain all built-in agents", () => {
			expect(builtinAgents).toBeDefined();
			expect(Array.isArray(builtinAgents)).toBe(true);
			expect(builtinAgents.length).toBe(1);
			expect(builtinAgents[0]).toBe(ragAgent);
		});

		it("should contain only valid AgentNode instances", () => {
			builtinAgents.forEach((agent) => {
				expect(agent.constructor.name).toBe("AgentNode");
				expect(agent.uuid).toBeDefined();
				expect(agent.title).toBeDefined();
				expect(agent.metadata.mimetype).toBe(Nodes.AGENT_MIMETYPE);
				expect(agent.metadata.parent).toBe(Folders.AGENTS_FOLDER_UUID);
			});
		});

		it("should have unique UUIDs", () => {
			const uuids = builtinAgents.map((agent) => agent.uuid);
			const uniqueUuids = new Set(uuids);
			expect(uniqueUuids.size).toBe(uuids.length);
		});
	});

	describe("RAG Agent", () => {
		it("should have correct basic properties", () => {
			expect(ragAgent.uuid).toBe("--rag-agent--");
			expect(ragAgent.fid).toBe("rag-agent");
			expect(ragAgent.title).toBe("RAG Agent");
			expect(ragAgent.title).toBe("RAG Agent");
			expect(ragAgent.description).toBe(
				"Retrieval-Augmented Generation agent for knowledge discovery and document analysis within Antbox ECM",
			);
			expect(ragAgent.owner).toBe(Users.ROOT_USER_EMAIL);
		});

		it("should have correct agent configuration", () => {
			expect(ragAgent.metadata.model).toBe("default");
			expect(ragAgent.metadata.temperature).toBe(0.7);
			expect(ragAgent.metadata.maxTokens).toBe(8192);
			expect(ragAgent.metadata.reasoning).toBe(false);
			expect(ragAgent.metadata.useTools).toBe(true);
			expect(ragAgent.metadata.structuredAnswer).toBeUndefined();
		});

		it("should have comprehensive system instructions", () => {
			const instructions = ragAgent.metadata.systemInstructions;

			// Core identity and purpose
			expect(instructions).toContain("RAG (Retrieval-Augmented Generation) agent");
			expect(instructions).toContain("knowledge discovery");
			expect(instructions).toContain("document analysis");
			expect(instructions).toContain("Antbox Enterprise Content Management");

			// Expertise areas
			expect(instructions).toContain("Semantic search and information retrieval");
			expect(instructions).toContain("Document analysis and content synthesis");
			expect(instructions).toContain("Metadata interpretation");
			expect(instructions).toContain("Multi-source information correlation");
			expect(instructions).toContain("Citation and source attribution");
		});

		it("should include search capabilities instructions", () => {
			const instructions = ragAgent.metadata.systemInstructions;

			// Semantic search
			expect(instructions).toContain("SEARCH CAPABILITIES");
			expect(instructions).toContain('[":content", "~=", "query"]');
			expect(instructions).toContain("conceptual and thematic searches");

			// Metadata search
			expect(instructions).toContain('["title", "contains", "keyword"]');
			expect(instructions).toContain('["mimetype", "==", "application/pdf"]');
			expect(instructions).toContain('["owner", "==", "user@example.com"]');
			expect(instructions).toContain('["createdTime", ">=", "2024-01-01"]');

			// Combined searches
			expect(instructions).toContain("Combined Searches");
			expect(instructions).toContain("multiple filters");
		});

		it("should include retrieval strategy guidance", () => {
			const instructions = ragAgent.metadata.systemInstructions;

			expect(instructions).toContain("RETRIEVAL STRATEGY");
			expect(instructions).toContain("Start with semantic search");
			expect(instructions).toContain("Refine with metadata filters");
			expect(instructions).toContain("Use get() to examine specific documents");
			expect(instructions).toContain("Use export() to access full content");
			expect(instructions).toContain("verify information across multiple sources");
		});

		it("should include response guidelines", () => {
			const instructions = ragAgent.metadata.systemInstructions;

			expect(instructions).toContain("RESPONSE GUIDELINES");
			expect(instructions).toContain("Always search before providing answers");
			expect(instructions).toContain("Include specific document references");
			expect(instructions).toContain("UUID, title, owner");
			expect(instructions).toContain("Cite your sources clearly");
			expect(instructions).toContain("synthesize coherently while maintaining attribution");
			expect(instructions).toContain("suggest alternative search strategies");
		});

		it("should include content analysis guidance", () => {
			const instructions = ragAgent.metadata.systemInstructions;

			expect(instructions).toContain("CONTENT ANALYSIS");
			expect(instructions).toContain("Summarize key findings");
			expect(instructions).toContain("Identify patterns and relationships");
			expect(instructions).toContain("Extract actionable insights");
			expect(instructions).toContain("Highlight any conflicting information");
			expect(instructions).toContain("Provide context about document types");
		});

		it("should have proper node metadata structure", () => {
			expect(ragAgent.metadata.mimetype).toBe(Nodes.AGENT_MIMETYPE);
			expect(ragAgent.metadata.parent).toBe(Folders.AGENTS_FOLDER_UUID);
			expect(ragAgent.metadata.owner).toBe(Users.ROOT_USER_EMAIL);
			expect(ragAgent.metadata.createdTime).toBeDefined();
			expect(ragAgent.metadata.modifiedTime).toBeDefined();
		});
	});

	describe("getBuiltinAgent function", () => {
		it("should return RAG agent by UUID", () => {
			const agent = getBuiltinAgent("--rag-agent--");
			expect(agent).toBe(ragAgent);
		});

		it("should return undefined for non-existent UUID", () => {
			const agent = getBuiltinAgent("non-existent-uuid");
			expect(agent).toBeUndefined();
		});

		it("should return undefined for empty string", () => {
			const agent = getBuiltinAgent("");
			expect(agent).toBeUndefined();
		});

		it("should be case-sensitive", () => {
			const agent = getBuiltinAgent("BUILTIN:AGENT:RAG");
			expect(agent).toBeUndefined();
		});
	});

	describe("getRAGAgent function", () => {
		it("should return the RAG agent directly", () => {
			const agent = getRAGAgent();
			expect(agent).toBe(ragAgent);
			expect(agent.uuid).toBe("--rag-agent--");
		});

		it("should always return the same instance", () => {
			const agent1 = getRAGAgent();
			const agent2 = getRAGAgent();
			expect(agent1).toBe(agent2);
		});
	});

	describe("isBuiltinAgent function", () => {
		it("should return true for RAG agent UUID", () => {
			expect(isBuiltinAgent("--rag-agent--")).toBe(true);
		});

		it("should return false for non-builtin UUID", () => {
			expect(isBuiltinAgent("custom-agent-uuid")).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isBuiltinAgent("")).toBe(false);
		});

		it("should return false for undefined", () => {
			expect(isBuiltinAgent(undefined as any)).toBe(false);
		});

		it("should be case-sensitive", () => {
			expect(isBuiltinAgent("--RAG-AGENT--")).toBe(false);
		});
	});

	describe("Agent validation", () => {
		it("should create RAG agent without validation errors", () => {
			// This test ensures the agent definition is valid
			const testAgentResult = AgentNode.create({
				uuid: "test-rag-uuid",
				fid: "test-rag-agent",
				title: "Test RAG Agent",

				description: "Test RAG agent",
				owner: Users.ROOT_USER_EMAIL,
				model: "default",
				temperature: 0.7,
				maxTokens: 8192,
				reasoning: false,
				useTools: true,
				systemInstructions: ragAgent.metadata.systemInstructions,
			});

			expect(testAgentResult.isRight()).toBe(true);
			if (testAgentResult.isRight()) {
				const testAgent = testAgentResult.value;
				expect(testAgent.uuid).toBe("test-rag-uuid");
				expect(testAgent.title).toBe("Test RAG Agent");
			}
		});

		it("should have all required agent properties", () => {
			const metadata = ragAgent.metadata;

			// Required string properties
			expect(typeof metadata.model).toBe("string");
			expect(metadata.model!.length).toBeGreaterThan(0);
			expect(typeof metadata.systemInstructions).toBe("string");
			expect(metadata.systemInstructions!.length).toBeGreaterThan(0);

			// Required numeric properties
			expect(typeof metadata.temperature).toBe("number");
			expect(metadata.temperature).toBeGreaterThanOrEqual(0);
			expect(metadata.temperature).toBeLessThanOrEqual(2);
			expect(typeof metadata.maxTokens).toBe("number");
			expect(metadata.maxTokens).toBeGreaterThan(0);

			// Required boolean properties
			expect(typeof metadata.reasoning).toBe("boolean");
			expect(typeof metadata.useTools).toBe("boolean");
		});

		it("should have reasonable configuration values", () => {
			const metadata = ragAgent.metadata;

			// Temperature should be balanced for RAG tasks
			expect(metadata.temperature).toBe(0.7);

			// Should have sufficient tokens for comprehensive responses
			expect(metadata.maxTokens).toBeGreaterThanOrEqual(4096);

			// Should have tools enabled for search operations
			expect(metadata.useTools).toBe(true);

			// Reasoning should be disabled for efficiency
			expect(metadata.reasoning).toBe(false);

			// Should use default model for flexibility
			expect(metadata.model).toBe("default");
		});
	});

	describe("System instructions quality", () => {
		const instructions = ragAgent.metadata.systemInstructions;

		it("should have sufficient length and detail", () => {
			expect(instructions!.length).toBeGreaterThan(1000);
			expect(instructions!.split("\n").length).toBeGreaterThan(20);
		});

		it("should include specific search examples", () => {
			// Should have concrete examples of search patterns
			expect(instructions).toContain('[":content", "~=", "machine learning algorithms"]');
			expect(instructions).toContain('["title", "contains", "keyword"]');
			expect(instructions).toContain('["mimetype", "==", "application/pdf"]');
		});

		it("should include citation format guidance", () => {
			expect(instructions).toContain("According to [Document Title] (UUID: abc-123)");
			expect(instructions).toContain("UUID, title, owner");
		});

		it("should emphasize grounding in retrieved data", () => {
			expect(instructions).toContain("ground your responses in actual retrieved data");
			expect(instructions).toContain("rather than making assumptions");
		});

		it("should include proper sectioning", () => {
			expect(instructions).toContain("SEARCH CAPABILITIES:");
			expect(instructions).toContain("RETRIEVAL STRATEGY:");
			expect(instructions).toContain("RESPONSE GUIDELINES:");
			expect(instructions).toContain("CONTENT ANALYSIS:");
		});
	});

	describe("Integration with existing infrastructure", () => {
		it("should use correct constants from domain layer", () => {
			expect(ragAgent.metadata.mimetype).toBe(Nodes.AGENT_MIMETYPE);
			expect(ragAgent.metadata.parent).toBe(Folders.AGENTS_FOLDER_UUID);
			expect(ragAgent.owner).toBe(Users.ROOT_USER_EMAIL);
		});

		it("should be compatible with NodeService builtin handling", () => {
			// Test that the agent can be found in builtin nodes
			const foundAgent = builtinAgents.find((agent) => agent.uuid === "--rag-agent--");
			expect(foundAgent).toBeDefined();
			expect(foundAgent).toBe(ragAgent);
		});
	});
});
