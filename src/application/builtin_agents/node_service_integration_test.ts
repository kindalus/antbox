import { describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import { builtinAgents, getRAGAgent } from "./index.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { Folders } from "domain/nodes/folders.ts";
import { Users } from "domain/users_groups/users.ts";

describe("NodeService Integration Verification", () => {
	describe("Built-in agents structure", () => {
		it("should have RAG agent with correct properties for NodeService integration", () => {
			const ragAgent = getRAGAgent();

			// Verify essential properties for NodeService integration
			expect(ragAgent.uuid).toBe("--rag-agent--");
			expect(ragAgent.fid).toBe("rag-agent");
			expect(ragAgent.title).toBe("RAG Agent");
			expect(ragAgent.owner).toBe(Users.ROOT_USER_EMAIL);

			// Verify agent-specific metadata
			expect(ragAgent.metadata.mimetype).toBe(Nodes.AGENT_MIMETYPE);
			expect(ragAgent.metadata.parent).toBe(Folders.AGENTS_FOLDER_UUID);
			expect(ragAgent.metadata.model).toBe("default");
			expect(ragAgent.metadata.temperature).toBe(0.7);
			expect(ragAgent.metadata.maxTokens).toBe(8192);
			expect(ragAgent.metadata.reasoning).toBe(false);
			expect(ragAgent.metadata.useTools).toBe(true);
			expect(ragAgent.metadata.systemInstructions).toBeDefined();
		});

		it("should export built-in agents array for NodeService", () => {
			expect(builtinAgents).toBeDefined();
			expect(Array.isArray(builtinAgents)).toBe(true);
			expect(builtinAgents.length).toBe(1);
			expect(builtinAgents[0]).toBe(getRAGAgent());
		});

		it("should have proper UUID format for built-in nodes", () => {
			builtinAgents.forEach((agent) => {
				// Built-in node UUIDs follow --name-- pattern
				expect(agent.uuid).toMatch(/^--[\w-]+--$/);
				expect(agent.metadata.mimetype).toBe(Nodes.AGENT_MIMETYPE);
				expect(agent.metadata.parent).toBe(Folders.AGENTS_FOLDER_UUID);
				expect(agent.owner).toBe(Users.ROOT_USER_EMAIL);
			});
		});
	});

	describe("Agent validation", () => {
		it("should have all required properties for valid AgentNode", () => {
			const ragAgent = getRAGAgent();
			const metadata = ragAgent.metadata;

			// Required Node properties
			expect(metadata.uuid).toBeTruthy();
			expect(metadata.title).toBeTruthy();
			expect(metadata.owner).toBeTruthy();
			expect(metadata.mimetype).toBe(Nodes.AGENT_MIMETYPE);
			expect(metadata.parent).toBe(Folders.AGENTS_FOLDER_UUID);

			// Required Agent properties with correct types
			expect(typeof metadata.model).toBe("string");
			expect(typeof metadata.temperature).toBe("number");
			expect(typeof metadata.maxTokens).toBe("number");
			expect(typeof metadata.reasoning).toBe("boolean");
			expect(typeof metadata.useTools).toBe("boolean");
			expect(typeof metadata.systemInstructions).toBe("string");

			// Validate ranges
			expect(metadata.temperature!).toBeGreaterThanOrEqual(0);
			expect(metadata.temperature!).toBeLessThanOrEqual(2);
			expect(metadata.maxTokens!).toBeGreaterThan(0);
			expect(metadata.systemInstructions!.length).toBeGreaterThan(100);
		});

		it("should be compatible with NodeService builtin node handling", () => {
			const ragAgent = getRAGAgent();

			// Test the same structure as other built-in entities
			expect(ragAgent.uuid).toBeDefined();
			expect(ragAgent.title).toBeDefined();
			expect(ragAgent.fid).toBeDefined();
			expect(ragAgent.owner).toBeDefined();
			expect(ragAgent.metadata).toBeDefined();

			// Should have the same interface as other NodeLike entities
			expect(typeof ragAgent.uuid).toBe("string");
			expect(typeof ragAgent.title).toBe("string");
			expect(typeof ragAgent.fid).toBe("string");
			expect(typeof ragAgent.owner).toBe("string");
			expect(typeof ragAgent.metadata).toBe("object");
		});
	});

	describe("RAG agent system instructions", () => {
		it("should have comprehensive search instructions", () => {
			const ragAgent = getRAGAgent();
			const instructions = ragAgent.metadata.systemInstructions!;

			// Core RAG functionality
			expect(instructions).toContain("RAG (Retrieval-Augmented Generation)");
			expect(instructions).toContain("knowledge discovery");
			expect(instructions).toContain("document analysis");

			// Search capabilities
			expect(instructions).toContain("SEARCH CAPABILITIES");
			expect(instructions).toContain('[":content", "~=", "query"]');
			expect(instructions).toContain("semantic search");

			// Tools and operations
			expect(instructions).toContain("get() to examine specific documents");
			expect(instructions).toContain("export() to access full content");

			// Response guidelines
			expect(instructions).toContain("RESPONSE GUIDELINES");
			expect(instructions).toContain("Cite your sources clearly");
			expect(instructions).toContain("UUID");
		});

		it("should include proper metadata filtering examples", () => {
			const ragAgent = getRAGAgent();
			const instructions = ragAgent.metadata.systemInstructions!;

			expect(instructions).toContain('["title", "contains", "keyword"]');
			expect(instructions).toContain('["mimetype", "==", "application/pdf"]');
			expect(instructions).toContain('["owner", "==", "user@example.com"]');
		});
	});

	describe("Integration readiness", () => {
		it("should be ready for NodeService #getBuiltinNodeOrFromRepository method", () => {
			// This verifies the agent can be found by NodeService's built-in node lookup
			const ragAgent = getRAGAgent();

			// Simulate the predicate function used in NodeService
			const uuidPredicate = (node: any) => node.uuid === "--rag-agent--";
			const fidPredicate = (node: any) => node.fid === "rag-agent";

			expect(builtinAgents.find(uuidPredicate)).toBe(ragAgent);
			expect(builtinAgents.find(fidPredicate)).toBe(ragAgent);
		});

		it("should be ready for NodeService.find filtering", () => {
			const ragAgent = getRAGAgent();

			// Simulate common filters that NodeService.find might use
			const mimetypeFilter = builtinAgents.filter((agent) =>
				agent.metadata.mimetype === Nodes.AGENT_MIMETYPE
			);
			const parentFilter = builtinAgents.filter((agent) =>
				agent.metadata.parent === Folders.AGENTS_FOLDER_UUID
			);
			const titleFilter = builtinAgents.filter((agent) =>
				agent.title.toLowerCase().includes("rag")
			);

			expect(mimetypeFilter).toContain(ragAgent);
			expect(parentFilter).toContain(ragAgent);
			expect(titleFilter).toContain(ragAgent);
		});
	});
});
