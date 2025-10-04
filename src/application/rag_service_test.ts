import { beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import { RAGService } from "./rag_service.ts";
import { AgentService } from "./agent_service.ts";
import { AuthenticationContext, Principal } from "./authentication_context.ts";
import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { ChatHistory } from "domain/ai/chat_message.ts";

// ============================================================================
// MOCK IMPLEMENTATIONS
// ============================================================================

class MockAgentService implements Partial<AgentService> {
	public lastChatInput: any = null;

	async chat(
		authContext: AuthenticationContext,
		agentUuid: string,
		text: string,
		options?: any,
	): Promise<Either<AntboxError, ChatHistory>> {
		this.lastChatInput = { authContext, agentUuid, text, options };

		if (agentUuid === "--rag-agent--") {
			return right([
				{ role: "user", parts: [{ text }] },
				{ role: "model", parts: [{ text: "Mock RAG response with search instructions" }] },
			] as ChatHistory);
		}

		return left(new AntboxError("AgentNotFound", "Agent not found"));
	}
}

// ============================================================================
// TEST DATA
// ============================================================================

const createMockAuthContext = (): AuthenticationContext => ({
	tenant: "test-tenant",
	principal: { email: "test@example.com", groups: [] },
	mode: "Direct",
});

// ============================================================================
// TESTS
// ============================================================================

describe("RAGService", () => {
	let ragService: RAGService;
	let mockAgentService: MockAgentService;
	let authContext: AuthenticationContext;

	beforeEach(() => {
		mockAgentService = new MockAgentService() as any;
		authContext = createMockAuthContext();

		ragService = new RAGService(
			{} as any, // NodeService not used directly anymore
			mockAgentService as any,
		);
	});

	describe("instructions delegation", () => {
		it("should pass domain-wide search instructions to agent", async () => {
			const result = await ragService.chat(
				authContext,
				"Tell me about artificial intelligence",
				{},
			);

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const history = result.value;
				expect(history).toHaveLength(2);
				expect(history[1].parts[0].text).toBe("Mock RAG response with search instructions");

				// Verify agent was called with proper instructions
				expect(mockAgentService.lastChatInput).toBeTruthy();
				expect(mockAgentService.lastChatInput.agentUuid).toBe("--rag-agent--");
				expect(mockAgentService.lastChatInput.text).toBe(
					"Tell me about artificial intelligence",
				);
				expect(mockAgentService.lastChatInput.options.instructions).toContain(
					"**INSTRUCTIONS**",
				);
				expect(mockAgentService.lastChatInput.options.instructions).toContain(
					"RAG (Retrieval-Augmented Generation) mode",
				);
				expect(mockAgentService.lastChatInput.options.instructions).toContain(
					"search across the entire platform content",
				);
				expect(mockAgentService.lastChatInput.options.instructions).toContain(
					'":content", "~="',
				);
			}
		});

		it("should pass scoped search instructions when parent provided", async () => {
			const result = await ragService.chat(authContext, "Find documents", {
				parent: "folder-a",
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				// Should include scoped search instructions
				expect(mockAgentService.lastChatInput.options.instructions).toContain(
					'limited to folder "folder-a"',
				);
				expect(mockAgentService.lastChatInput.options.instructions).toContain(
					'["parent", "==", "folder-a"]',
				);
				expect(mockAgentService.lastChatInput.options.instructions).toContain(
					"SEARCH TOOLS AVAILABLE",
				);
			}
		});
	});

	describe("search strategy instructions", () => {
		it("should include semantic search instructions", async () => {
			const result = await ragService.chat(authContext, "search query", {});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const instructions = mockAgentService.lastChatInput.options.instructions;
				expect(instructions).toContain("semantic/conceptual queries");
				expect(instructions).toContain('[":content", "~=", "user query"]');
				expect(instructions).toContain("find(filters)");
				expect(instructions).toContain("get(uuid)");
				expect(instructions).toContain("export(uuid)");
			}
		});

		it("should include fallback strategy instructions", async () => {
			const result = await ragService.chat(authContext, "search query", {});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const instructions = mockAgentService.lastChatInput.options.instructions;
				expect(instructions).toContain("specific metadata searches");
				expect(instructions).toContain('["title", "contains", "keyword"]');
				expect(instructions).toContain('["mimetype", "==", "application/pdf"]');
				expect(instructions).toContain("broader keyword searches");
			}
		});

		it("should include response guidelines", async () => {
			const result = await ragService.chat(authContext, "search query", {});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const instructions = mockAgentService.lastChatInput.options.instructions;
				expect(instructions).toContain("RESPONSE GUIDELINES");
				expect(instructions).toContain("Always search for information before responding");
				expect(instructions).toContain("Include relevant document UUIDs");
				expect(instructions).toContain("what sources it came from");
			}
		});
	});

	describe("parameter pass-through", () => {
		it("should pass through history and options to agent service", async () => {
			const history: ChatHistory = [
				{ role: "user", parts: [{ text: "Previous question" }] },
				{ role: "model", parts: [{ text: "Previous answer" }] },
			];

			const result = await ragService.chat(authContext, "Follow-up question", {
				history,
				temperature: 0.5,
				maxTokens: 4096,
			});

			expect(result.isRight()).toBe(true);
			expect(mockAgentService.lastChatInput.options.history).toEqual(history);
			expect(mockAgentService.lastChatInput.options.temperature).toBe(0.5);
			expect(mockAgentService.lastChatInput.options.maxTokens).toBe(4096);
			expect(mockAgentService.lastChatInput.options.instructions).toBeDefined();
		});

		it("should pass original user message unchanged", async () => {
			const originalMessage = "What are the latest reports on machine learning?";

			const result = await ragService.chat(authContext, originalMessage, {});

			expect(result.isRight()).toBe(true);
			expect(mockAgentService.lastChatInput.text).toBe(originalMessage);
		});
	});

	describe("error handling", () => {
		it("should handle agent service failures", async () => {
			const failingAgentService = {
				async chat(): Promise<Either<AntboxError, ChatHistory>> {
					return left(new AntboxError("AgentError", "Agent execution failed"));
				},
			};

			const ragServiceWithFailingAgent = new RAGService(
				{} as any,
				failingAgentService as any,
			);

			const result = await ragServiceWithFailingAgent.chat(authContext, "test query", {});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("Agent execution failed");
			}
		});

		it("should handle missing RAG agent", async () => {
			const agentServiceWithoutRAG = {
				async chat(): Promise<Either<AntboxError, ChatHistory>> {
					return left(new AntboxError("AgentNotFound", "RAG agent not found"));
				},
			};

			const ragServiceWithoutRAG = new RAGService(
				{} as any,
				agentServiceWithoutRAG as any,
			);

			const result = await ragServiceWithoutRAG.chat(authContext, "test query", {});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("RAG agent not found");
			}
		});
	});

	describe("instructions content", () => {
		it("should include proper search scope information for domain-wide searches", async () => {
			const result = await ragService.chat(authContext, "Find documents", {});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const instructions = mockAgentService.lastChatInput.options.instructions;
				expect(instructions).toContain(
					"SEARCH SCOPE: You have access to search across the entire platform content",
				);
				expect(instructions).not.toContain('["parent", "==",');
			}
		});

		it("should include proper search scope information for folder-scoped searches", async () => {
			const result = await ragService.chat(authContext, "Find documents", {
				parent: "test-folder-uuid",
			});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const instructions = mockAgentService.lastChatInput.options.instructions;
				expect(instructions).toContain(
					'SEARCH SCOPE: Your search is limited to folder "test-folder-uuid"',
				);
				expect(instructions).toContain('["parent", "==", "test-folder-uuid"]');
			}
		});

		it("should provide complete search strategy guidance", async () => {
			const result = await ragService.chat(authContext, "Find documents", {});

			expect(result.isRight()).toBe(true);
			if (result.isRight()) {
				const instructions = mockAgentService.lastChatInput.options.instructions;
				expect(instructions).toContain("SEARCH STRATEGY:");
				expect(instructions).toContain("SEARCH TOOLS AVAILABLE:");
				expect(instructions).toContain("RESPONSE GUIDELINES:");
			}
		});
	});
});
