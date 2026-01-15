import { beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { expect } from "jsr:@std/expect";
import { RAG_MIN_SIMILARITY_SCORE, RAG_TOP_N_DOCUMENTS, RAGService } from "./rag_service.ts";
import { AuthenticationContext } from "../security/authentication_context.ts";
import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { ChatMessage } from "domain/ai/chat_message.ts";
import { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeFilterResult } from "domain/nodes/node_repository.ts";
import type { NodeService } from "../nodes/node_service.ts";
import type { AIModel } from "./ai_model.ts";

// ============================================================================
// MOCK IMPLEMENTATIONS
// ============================================================================

class MockNodeService implements Partial<NodeService> {
	public lastFindInput: any = null;
	public lastExportInput: any = null;
	public findResults: NodeMetadata[] = [];
	public findScores: Record<string, number> = {};
	public exportResults: Map<string, File> = new Map();

	async find(
		ctx: AuthenticationContext,
		filters: any,
		pageSize?: number,
		pageToken?: number,
	): Promise<Either<AntboxError, NodeFilterResult & { scores?: Record<string, number> }>> {
		this.lastFindInput = { ctx, filters, pageSize, pageToken };
		return right({
			nodes: this.findResults as any,
			pageSize: pageSize ?? 20,
			pageToken: pageToken ?? 1,
			scores: this.findScores,
		});
	}

	async export(
		ctx: AuthenticationContext,
		uuid: string,
	): Promise<Either<AntboxError, File>> {
		this.lastExportInput = { ctx, uuid };
		const file = this.exportResults.get(uuid);
		if (file) {
			return right(file);
		}
		return left(new AntboxError("NodeNotFound", `Node ${uuid} not found`));
	}
}

class MockAIModel implements Partial<AIModel> {
	public lastChatInput: any = null;
	public lastOcrInput: any = null;
	public ocrResults: Map<string, string> = new Map();

	modelName = "mock-model";
	llm = true;
	tools = true;
	embeddings = false;
	files = true;
	reasoning = false;

	async chat(
		input: string | ChatMessage,
		options?: {
			systemPrompt?: string;
			history?: any[];
			temperature?: number;
			maxTokens?: number;
		},
	): Promise<Either<AntboxError, ChatMessage>> {
		this.lastChatInput = { input, ...options };
		return right({
			role: "model",
			parts: [{ text: "Mock RAG response based on provided documents" }],
		});
	}

	async embed(texts: string[]): Promise<Either<AntboxError, number[][]>> {
		return right(texts.map(() => [0.1, 0.2, 0.3]));
	}

	async ocr(file: File): Promise<Either<AntboxError, string>> {
		this.lastOcrInput = file;
		const content = this.ocrResults.get(file.name);
		if (content) {
			return right(content);
		}
		return right(`Content of ${file.name}`);
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

const createMockNode = (uuid: string, title: string): NodeMetadata => ({
	uuid,
	fid: uuid,
	title,
	description: `Description for ${title}`,
	mimetype: "application/pdf",
	parent: "root",
	owner: "test@example.com",
	createdTime: new Date().toISOString(),
	modifiedTime: new Date().toISOString(),
});

// ============================================================================
// TESTS
// ============================================================================

describe("RAGService", () => {
	let ragService: RAGService;
	let mockNodeService: MockNodeService;
	let mockAIModel: MockAIModel;
	let mockOcrModel: MockAIModel;
	let authContext: AuthenticationContext;

	beforeEach(() => {
		mockNodeService = new MockNodeService();
		mockAIModel = new MockAIModel();
		mockOcrModel = new MockAIModel();
		authContext = createMockAuthContext();

		ragService = new RAGService(
			mockNodeService as any,
			mockAIModel as any,
			mockOcrModel as any,
		);
	});

	describe("constants", () => {
		it("should export RAG_TOP_N_DOCUMENTS constant", () => {
			expect(RAG_TOP_N_DOCUMENTS).toBeDefined();
			expect(typeof RAG_TOP_N_DOCUMENTS).toBe("number");
			expect(RAG_TOP_N_DOCUMENTS).toBeGreaterThan(0);
		});

		it("should export RAG_MIN_SIMILARITY_SCORE constant", () => {
			expect(RAG_MIN_SIMILARITY_SCORE).toBeDefined();
			expect(typeof RAG_MIN_SIMILARITY_SCORE).toBe("number");
			expect(RAG_MIN_SIMILARITY_SCORE).toBeGreaterThanOrEqual(0);
			expect(RAG_MIN_SIMILARITY_SCORE).toBeLessThanOrEqual(1);
		});
	});

	describe("system-driven retrieval workflow", () => {
		it("should automatically perform semantic search with user query", async () => {
			mockNodeService.findResults = [createMockNode("doc-1", "Document 1")];
			mockNodeService.findScores = { "doc-1": 0.9 };
			mockNodeService.exportResults.set("doc-1", new File(["content"], "doc-1.pdf"));

			const result = await ragService.chat(
				authContext,
				"What is machine learning?",
				{},
			);

			expect(result.isRight()).toBe(true);

			// Verify semantic search was performed automatically
			expect(mockNodeService.lastFindInput).toBeTruthy();
			expect(mockNodeService.lastFindInput.filters).toBe("?What is machine learning?");
		});

		it("should retrieve full content of top documents", async () => {
			const doc1 = createMockNode("doc-1", "Document 1");
			const doc2 = createMockNode("doc-2", "Document 2");
			mockNodeService.findResults = [doc1, doc2];
			mockNodeService.findScores = { "doc-1": 0.95, "doc-2": 0.85 };
			mockNodeService.exportResults.set("doc-1", new File(["Content 1"], "doc-1.pdf"));
			mockNodeService.exportResults.set("doc-2", new File(["Content 2"], "doc-2.pdf"));

			await ragService.chat(authContext, "Search query", {});

			// Verify export was called for each document
			expect(mockNodeService.lastExportInput).toBeTruthy();
		});

		it("should build grounded system prompt with documents", async () => {
			mockNodeService.findResults = [createMockNode("doc-1", "Document 1")];
			mockNodeService.findScores = { "doc-1": 0.9 };
			mockNodeService.exportResults.set("doc-1", new File(["content"], "doc-1.pdf"));
			mockOcrModel.ocrResults.set("doc-1.pdf", "Extracted content from document");

			await ragService.chat(authContext, "Search query", {});

			// Verify system prompt includes grounding instructions
			expect(mockAIModel.lastChatInput).toBeTruthy();
			const systemPrompt = mockAIModel.lastChatInput.systemPrompt;
			expect(systemPrompt).toContain("ONLY use information from the documents provided");
			expect(systemPrompt).toContain("Do NOT use your general knowledge");
			expect(systemPrompt).toContain("RETRIEVED DOCUMENTS");
		});

		it("should include document content in system prompt", async () => {
			mockNodeService.findResults = [createMockNode("doc-1", "Test Document")];
			mockNodeService.findScores = { "doc-1": 0.9 };
			mockNodeService.exportResults.set("doc-1", new File(["content"], "doc-1.pdf"));
			mockOcrModel.ocrResults.set("doc-1.pdf", "This is the extracted document content");

			await ragService.chat(authContext, "Search query", {});

			expect(mockAIModel.lastChatInput).toBeTruthy();
			const systemPrompt = mockAIModel.lastChatInput.systemPrompt;
			expect(systemPrompt).toContain("Test Document");
			expect(systemPrompt).toContain("This is the extracted document content");
		});
	});

	describe("score filtering", () => {
		it("should filter out documents below minimum score", async () => {
			const highScoreDoc = createMockNode("high-score", "High Score Doc");
			const lowScoreDoc = createMockNode("low-score", "Low Score Doc");
			mockNodeService.findResults = [highScoreDoc, lowScoreDoc];
			mockNodeService.findScores = {
				"high-score": 0.9,
				"low-score": 0.2, // Below RAG_MIN_SIMILARITY_SCORE
			};
			mockNodeService.exportResults.set("high-score", new File(["content"], "high.pdf"));
			mockNodeService.exportResults.set("low-score", new File(["content"], "low.pdf"));

			await ragService.chat(authContext, "Search query", {});

			const systemPrompt = mockAIModel.lastChatInput.systemPrompt;
			expect(systemPrompt).toContain("High Score Doc");
			expect(systemPrompt).not.toContain("Low Score Doc");
		});
	});

	describe("no results handling", () => {
		it("should handle case when no documents are found", async () => {
			mockNodeService.findResults = [];
			mockNodeService.findScores = {};

			const result = await ragService.chat(authContext, "Search query", {});

			expect(result.isRight()).toBe(true);

			const systemPrompt = mockAIModel.lastChatInput.systemPrompt;
			expect(systemPrompt).toContain("NO DOCUMENTS FOUND");
			expect(systemPrompt).toContain("No documents were found that match your query");
		});
	});

	describe("grounding instructions", () => {
		it("should include citation requirements", async () => {
			mockNodeService.findResults = [createMockNode("doc-1", "Document 1")];
			mockNodeService.findScores = { "doc-1": 0.9 };
			mockNodeService.exportResults.set("doc-1", new File(["content"], "doc-1.pdf"));

			await ragService.chat(authContext, "Search query", {});

			const systemPrompt = mockAIModel.lastChatInput.systemPrompt;
			expect(systemPrompt).toContain("Always cite your sources");
			expect(systemPrompt).toContain("Reference documents by their title and UUID");
		});

		it("should include instruction to acknowledge when info not found", async () => {
			mockNodeService.findResults = [createMockNode("doc-1", "Document 1")];
			mockNodeService.findScores = { "doc-1": 0.9 };
			mockNodeService.exportResults.set("doc-1", new File(["content"], "doc-1.pdf"));

			await ragService.chat(authContext, "Search query", {});

			const systemPrompt = mockAIModel.lastChatInput.systemPrompt;
			expect(systemPrompt).toContain(
				"I couldn't find information about that in the available documents",
			);
		});
	});

	describe("document metadata in prompt", () => {
		it("should include document metadata in prompt", async () => {
			const doc = createMockNode("doc-1", "Test Document");
			doc.description = "A test document description";
			doc.owner = "owner@example.com";
			mockNodeService.findResults = [doc];
			mockNodeService.findScores = { "doc-1": 0.85 };
			mockNodeService.exportResults.set("doc-1", new File(["content"], "doc-1.pdf"));

			await ragService.chat(authContext, "Search query", {});

			const systemPrompt = mockAIModel.lastChatInput.systemPrompt;
			expect(systemPrompt).toContain("UUID: doc-1");
			expect(systemPrompt).toContain("Title: Test Document");
			expect(systemPrompt).toContain("Type: application/pdf");
			expect(systemPrompt).toContain("Relevance Score: 85.0%");
		});
	});

	describe("conversation history", () => {
		it("should include user message in chat history", async () => {
			mockNodeService.findResults = [];
			mockNodeService.findScores = {};

			const result = await ragService.chat(authContext, "What is AI?", {});

			expect(result.isRight()).toBe(true);
			expect(mockAIModel.lastChatInput).toBeTruthy();

			const history = mockAIModel.lastChatInput.history;
			expect(history).toHaveLength(1);
			expect(history[0].role).toBe("user");
			expect(history[0].parts[0].text).toBe("What is AI?");
		});

		it("should preserve previous conversation history", async () => {
			mockNodeService.findResults = [];
			mockNodeService.findScores = {};

			const previousHistory = [
				{ role: "user", parts: [{ text: "Previous question" }] },
				{ role: "model", parts: [{ text: "Previous answer" }] },
			];

			await ragService.chat(authContext, "Follow-up question", {
				history: previousHistory as any,
			});

			expect(mockAIModel.lastChatInput).toBeTruthy();
			const history = mockAIModel.lastChatInput.history;
			expect(history).toHaveLength(3);
			expect(history[0].parts[0].text).toBe("Previous question");
			expect(history[1].parts[0].text).toBe("Previous answer");
			expect(history[2].parts[0].text).toBe("Follow-up question");
		});
	});

	describe("model parameters", () => {
		it("should use default temperature and maxTokens", async () => {
			mockNodeService.findResults = [];
			mockNodeService.findScores = {};

			await ragService.chat(authContext, "Query", {});

			expect(mockAIModel.lastChatInput).toBeTruthy();
			expect(mockAIModel.lastChatInput.temperature).toBe(0.3); // RAG_DEFAULT_TEMPERATURE
			expect(mockAIModel.lastChatInput.maxTokens).toBe(4096); // RAG_DEFAULT_MAX_TOKENS
		});

		it("should allow overriding temperature and maxTokens", async () => {
			mockNodeService.findResults = [];
			mockNodeService.findScores = {};

			await ragService.chat(authContext, "Query", {
				temperature: 0.7,
				maxTokens: 8192,
			});

			expect(mockAIModel.lastChatInput).toBeTruthy();
			expect(mockAIModel.lastChatInput.temperature).toBe(0.7);
			expect(mockAIModel.lastChatInput.maxTokens).toBe(8192);
		});
	});

	describe("error handling", () => {
		it("should handle search failures", async () => {
			const failingNodeService = {
				async find(): Promise<Either<AntboxError, any>> {
					return left(new AntboxError("SearchError", "Search failed"));
				},
			};

			const ragServiceWithFailingSearch = new RAGService(
				failingNodeService as any,
				mockAIModel as any,
				mockOcrModel as any,
			);

			const result = await ragServiceWithFailingSearch.chat(authContext, "Query", {});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("Search failed");
			}
		});

		it("should handle LLM chat failures", async () => {
			mockNodeService.findResults = [];
			mockNodeService.findScores = {};

			const failingAIModel = {
				async chat(): Promise<Either<AntboxError, ChatMessage>> {
					return left(new AntboxError("LLMError", "LLM chat failed"));
				},
			};

			const ragServiceWithFailingLLM = new RAGService(
				mockNodeService as any,
				failingAIModel as any,
				mockOcrModel as any,
			);

			const result = await ragServiceWithFailingLLM.chat(authContext, "Query", {});

			expect(result.isLeft()).toBe(true);
			if (result.isLeft()) {
				expect(result.value.message).toContain("LLM chat failed");
			}
		});

		it("should gracefully handle export failures for individual documents", async () => {
			const doc1 = createMockNode("doc-1", "Document 1");
			const doc2 = createMockNode("doc-2", "Document 2");
			mockNodeService.findResults = [doc1, doc2];
			mockNodeService.findScores = { "doc-1": 0.9, "doc-2": 0.85 };
			// Only doc-2 has export result, doc-1 will fail
			mockNodeService.exportResults.set("doc-2", new File(["content"], "doc-2.pdf"));

			const result = await ragService.chat(authContext, "Query", {});

			// Should still succeed with doc-2
			expect(result.isRight()).toBe(true);

			const systemPrompt = mockAIModel.lastChatInput.systemPrompt;
			expect(systemPrompt).toContain("Document 2");
		});
	});
});
