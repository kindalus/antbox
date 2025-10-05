import { expect } from "jsr:@std/expect";
import { beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { AgentService } from "./agent_service.ts";
import { NodeService } from "./node_service.ts";
import { FeatureService } from "./feature_service.ts";
import { AuthenticationContext } from "./authentication_context.ts";
import { AgentNode } from "domain/ai/agent_node.ts";
import { AgentNotFoundError } from "domain/ai/agent_not_found_error.ts";
import { AIModel } from "./ai_model.ts";
import { ChatHistory, ChatMessage } from "domain/ai/chat_message.ts";
import { FeatureDTO } from "./feature_dto.ts";
import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { ValidationError } from "shared/validation_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Embedding } from "./ai_model.ts";
import { AnswerOptions, ChatOptions } from "./agent_service.ts";

// ============================================================================
// MOCKS
// ============================================================================

class MockNodeService {
	private nodes = new Map<string, any>();

	async create(authContext: AuthenticationContext, node: any) {
		// Don't modify readonly properties - just store the node as-is
		// The real NodeService would handle persistence differently
		this.nodes.set(node.uuid, node);
		return right(node);
	}

	async get(authContext: AuthenticationContext, uuid: string) {
		const node = this.nodes.get(uuid);
		if (!node) {
			return left(new NodeNotFoundError(uuid));
		}
		return right(node);
	}

	async update(authContext: AuthenticationContext, node: any) {
		// Don't modify readonly properties - just store the node as-is
		this.nodes.set(node.uuid, node);
		return right(node);
	}

	async delete(authContext: AuthenticationContext, uuid: string) {
		if (!this.nodes.has(uuid)) {
			return left(new NodeNotFoundError(uuid));
		}
		this.nodes.delete(uuid);
		return right(undefined);
	}

	async find(authContext: AuthenticationContext, filters: any[], limit: number) {
		// Filter nodes to only return AgentNodes for agent queries
		const nodes = Array.from(this.nodes.values()).filter((node) => {
			// Simulate agent filtering
			if (filters.some((f) => f[0] === "mimetype" && f[2] === "application/vnd.antbox.agent")) {
				return node.mimetype === "application/vnd.antbox.agent";
			}
			return true;
		});
		return right({ nodes, total: nodes.length });
	}

	// Test helper
	clear() {
		this.nodes.clear();
	}
}

class MockFeatureService {
	private features = new Map<string, FeatureDTO>();

	constructor() {
		// Add some test features
		this.features.set("feature-1", {
			uuid: "feature-1",
			name: "search",
			description: "Search for content",
			exposeAction: false,
			runOnCreates: false,
			runOnUpdates: false,
			runManually: true,
			filters: [],
			exposeExtension: false,
			exposeAITool: true,
			groupsAllowed: [],
			parameters: [
				{
					name: "query",
					type: "string",
					required: true,
					description: "Search query",
				},
			],
			returnType: "array" as const,
			returnDescription: "Search results",
		});
	}

	async getAITool(authContext: AuthenticationContext, uuid: string) {
		const feature = this.features.get(uuid);
		if (!feature) {
			return left(new AntboxError("FeatureNotFound", "Feature not found"));
		}
		return right(feature);
	}

	async listAITools(authContext: AuthenticationContext) {
		// Return all features that are AI tools as mock nodes
		const aiToolNodes = Array.from(this.features.values())
			.filter((feature) => feature.exposeAITool)
			.map((feature) => ({
				uuid: feature.uuid,
				title: feature.name,
				mimetype: "application/vnd.antbox.feature",
			}));

		return right(aiToolNodes);
	}
}

class MockAIModel implements AIModel {
	modelName = "mock-model";
	embeddings = false;
	llm = true;
	tools = true;
	files = true;
	reasoning = true;

	async embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>> {
		return left(new AntboxError("NotSupported", "Mock doesn't support embeddings"));
	}

	async ocr(file: File): Promise<Either<AntboxError, string>> {
		return left(new AntboxError("NotSupported", "Mock doesn't support OCR"));
	}

	async chat(
		text: string,
		options?: {
			systemPrompt?: string;
			history?: ChatHistory;
			tools?: Partial<FeatureDTO>[];
			files?: File[];
			temperature?: number;
			maxTokens?: number;
			reasoning?: boolean;
			structuredOutput?: string;
		},
	): Promise<Either<AntboxError, ChatMessage>> {
		// Mock successful chat response
		const responseText = `Mock response to: ${text}`;
		const message: ChatMessage = {
			role: "model" as const,
			parts: [{ text: responseText }],
		};

		return right(message);
	}

	async answer(
		text: string,
		options?: {
			systemPrompt?: string;
			tools?: Partial<FeatureDTO>[];
			files?: File[];
			temperature?: number;
			maxTokens?: number;
			reasoning?: boolean;
			structuredOutput?: string;
		},
	): Promise<Either<AntboxError, ChatMessage>> {
		// Mock successful answer response
		const responseText = options?.structuredOutput
			? JSON.stringify({ answer: `Mock answer to: ${text}` })
			: `Mock answer to: ${text}`;

		return right({
			role: "model" as const,
			parts: [{ text: responseText }],
		});
	}
}

// ============================================================================
// TESTS
// ============================================================================

describe("AgentService", () => {
	let agentService: AgentService;
	let nodeService: MockNodeService;
	let featureService: MockFeatureService;
	let aiModel: MockAIModel;
	let authContext: AuthenticationContext;

	beforeEach(() => {
		nodeService = new MockNodeService();
		featureService = new MockFeatureService();
		aiModel = new MockAIModel();
		authContext = {
			tenant: "test",
			principal: { email: "test@example.com", groups: ["admin"] },
			mode: "Direct",
		};

		agentService = new AgentService(
			nodeService as any,
			featureService as any,
			aiModel, // default model instance
		);

		nodeService.clear();
	});

	describe("createOrReplace", () => {
		it("should create a new agent successfully", async () => {
			const metadata = {
				title: "Test Agent",
				description: "A test agent",
				systemInstructions: "You are a helpful assistant",
				model: "gemini-1.5-pro",
				temperature: 0.8,
				maxTokens: 4000,
				reasoning: true,
				useTools: true,
			};

			const result = await agentService.createOrReplace(authContext, metadata);

			expect(result.isRight()).toBeTruthy();
			if (result.isRight()) {
				const agent = result.value;
				expect(agent.title).toBe("Test Agent");
				expect(agent.description).toBe("A test agent");
				expect(agent.model).toBe("gemini-1.5-pro");
				expect(agent.temperature).toBe(0.8);
				expect(agent.maxTokens).toBe(4000);
				expect(agent.reasoning).toBe(true);
				expect(agent.useTools).toBe(true);
				expect(agent.owner).toBe("test@example.com");
				expect(agent.systemInstructions).toBe("You are a helpful assistant");
			}
		});

		it("should use defaults for optional parameters", async () => {
			const metadata = {
				title: "Simple Agent",
				systemInstructions: "Simple instructions",
			};

			const result = await agentService.createOrReplace(authContext, metadata);

			expect(result.isRight()).toBeTruthy();
			if (result.isRight()) {
				const agent = result.value;
				expect(agent.model).toBe("default"); // kept as default
				expect(agent.temperature).toBe(0.7);
				expect(agent.maxTokens).toBe(8192);
				expect(agent.reasoning).toBe(false);
				expect(agent.useTools).toBe(false);
			}
		});

		it("should keep 'default' model as is", async () => {
			const metadata = {
				title: "Default Model Agent",
				systemInstructions: "Test instructions",
				model: "default",
			};

			const result = await agentService.createOrReplace(authContext, metadata);

			expect(result.isRight()).toBeTruthy();
			if (result.isRight()) {
				const agent = result.value;
				expect(agent.model).toBe("default");
			}
		});

		it("should fail with validation error for invalid data", async () => {
			const metadata = {
				title: "", // Invalid empty title
				systemInstructions: "Test instructions",
			};

			const result = await agentService.createOrReplace(authContext, metadata);

			expect(result.isLeft()).toBeTruthy();
		});

		it("should replace existing agent when UUID is provided", async () => {
			// First create an agent
			const initialMetadata = {
				title: "Original Agent",
				systemInstructions: "Original instructions",
				model: "gemini-1.5-pro",
			};

			const createResult = await agentService.createOrReplace(authContext, initialMetadata);
			expect(createResult.isRight()).toBeTruthy();

			if (createResult.isRight()) {
				const originalAgent = createResult.value;

				// Now replace it with new metadata using the same UUID
				const updatedMetadata = {
					uuid: originalAgent.uuid,
					title: "Updated Agent",
					systemInstructions: "Updated instructions",
					temperature: 0.9,
				};

				const replaceResult = await agentService.createOrReplace(authContext, updatedMetadata);
				expect(replaceResult.isRight()).toBeTruthy();

				if (replaceResult.isRight()) {
					const updatedAgent = replaceResult.value;
					expect(updatedAgent.uuid).toBe(originalAgent.uuid);
					expect(updatedAgent.title).toBe("Updated Agent");
					expect(updatedAgent.systemInstructions).toBe("Updated instructions");
					expect(updatedAgent.temperature).toBe(0.9);
				}
			}
		});
	});

	describe("get", () => {
		it("should get an existing agent", async () => {
			// Create an agent first
			const metadata = {
				title: "Test Agent",
				systemInstructions: "Test instructions",
			};

			const createResult = await agentService.createOrReplace(authContext, metadata);
			expect(createResult.isRight()).toBeTruthy();

			if (createResult.isRight()) {
				const createdAgent = createResult.value;

				// Get the agent
				const getResult = await agentService.get(authContext, createdAgent.uuid);
				expect(getResult.isRight()).toBeTruthy();

				if (getResult.isRight()) {
					const retrievedAgent = getResult.value;
					expect(retrievedAgent.uuid).toBe(createdAgent.uuid);
					expect(retrievedAgent.title).toBe("Test Agent");
				}
			}
		});

		it("should return AgentNotFoundError for non-existent agent", async () => {
			const result = await agentService.get(authContext, "non-existent");

			expect(result.isLeft()).toBeTruthy();
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(AgentNotFoundError);
			}
		});
	});

	describe("delete", () => {
		it("should delete an existing agent", async () => {
			// Create an agent first
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Delete Test Agent",
				systemInstructions: "Test instructions",
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				const agent = createResult.value;

				const deleteResult = await agentService.delete(authContext, agent.uuid);
				expect(deleteResult.isRight()).toBeTruthy();

				// Verify it's gone
				const getResult = await agentService.get(authContext, agent.uuid);
				expect(getResult.isLeft()).toBeTruthy();
				if (getResult.isLeft()) {
					expect(getResult.value).toBeInstanceOf(AgentNotFoundError);
				}
			}
		});

		it("should return AgentNotFoundError for non-existent agent", async () => {
			const result = await agentService.delete(authContext, "non-existent");

			expect(result.isLeft()).toBeTruthy();
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(AgentNotFoundError);
			}
		});
	});

	describe("list", () => {
		it("should list all agents", async () => {
			// Create multiple agents
			await agentService.createOrReplace(authContext, {
				title: "Agent 1",
				systemInstructions: "Instructions 1",
			});

			await agentService.createOrReplace(authContext, {
				title: "Agent 2",
				systemInstructions: "Instructions 2",
			});

			const result = await agentService.list(authContext);

			expect(result.isRight()).toBeTruthy();
			if (result.isRight()) {
				const agents = result.value;
				expect(agents.length).toBe(2);
				expect(agents.map((a) => a.title).sort()).toEqual(["Agent 1", "Agent 2"]);
			}
		});

		it("should return empty list when no agents exist", async () => {
			const result = await agentService.list(authContext);

			expect(result.isRight()).toBeTruthy();
			if (result.isRight()) {
				expect(result.value).toHaveLength(0);
			}
		});
	});

	describe("chat", () => {
		it("should execute chat successfully", async () => {
			// Create an agent first
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Chat Agent",
				systemInstructions: "You are helpful",
				useTools: false,
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				const agent = createResult.value;

				const chatResult = await agentService.chat(
					authContext,
					agent.uuid,
					"Hello, how are you?",
					{
						history: [],
					},
				);

				expect(chatResult.isRight()).toBeTruthy();
				if (chatResult.isRight()) {
					const history = chatResult.value;
					expect(Array.isArray(history)).toBe(true);
					expect(history.length).toBeGreaterThan(0);
					const lastMessage = history[history.length - 1];
					expect(lastMessage.role).toBe("model");
					expect(lastMessage.parts[0].text).toContain("Hello, how are you?");
				}
			}
		});

		it("should use custom tools when specified", async () => {
			// Create an agent with tools enabled
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Tool Agent",
				systemInstructions: "You can use tools",
				useTools: true,
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				const agent = createResult.value;

				const chatResult = await agentService.chat(
					authContext,
					agent.uuid,
					"Search for something",
				);

				expect(chatResult.isRight()).toBeTruthy();
				if (chatResult.isRight()) {
					const history = chatResult.value;
					expect(Array.isArray(history)).toBe(true);
				}
			}
		});

		it("should override agent parameters when specified", async () => {
			// Create an agent
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Parameter Agent",
				systemInstructions: "Test agent",
				temperature: 0.5,
				maxTokens: 1000,
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				const agent = createResult.value;

				const chatResult = await agentService.chat(authContext, agent.uuid, "Test message", {
					temperature: 0.9,
					maxTokens: 2000,
				});

				expect(chatResult.isRight()).toBeTruthy();
				// Note: We can't easily test parameter override without mocking the AI model more deeply
			}
		});

		it("should return AgentNotFoundError for non-existent agent", async () => {
			const result = await agentService.chat(authContext, "non-existent", "Hello");

			expect(result.isLeft()).toBeTruthy();
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(AgentNotFoundError);
			}
		});
	});

	describe("answer", () => {
		it("should execute answer successfully", async () => {
			// Create an agent first
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Answer Agent",
				systemInstructions: "You provide direct answers",
				useTools: false,
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				const agent = createResult.value;

				const answerResult = await agentService.answer(authContext, agent.uuid, "What is 2+2?");

				expect(answerResult.isRight()).toBeTruthy();
				if (answerResult.isRight()) {
					const message = answerResult.value;
					expect(message.role).toBe("model");
					expect(message.parts[0].text).toContain("What is 2+2?");
				}
			}
		});

		it("should return structured output when agent has structured answer", async () => {
			// Create an agent with structured answer
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Structured Agent",
				systemInstructions: "You provide structured answers",
				structuredAnswer: '{"type": "object", "properties": {"answer": {"type": "string"}}}',
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				const agent = createResult.value;

				const answerResult = await agentService.answer(
					authContext,
					agent.uuid,
					"Structured question",
				);

				expect(answerResult.isRight()).toBeTruthy();
				if (answerResult.isRight()) {
					const message = answerResult.value;
					expect(message.role).toBe("model");
					// The text should be a stringified JSON object
					expect(typeof message.parts[0].text).toBe("string");
					const parsed = JSON.parse(message.parts[0].text!);
					expect(typeof parsed).toBe("object");
					expect(parsed.answer).toContain("Structured question");
				}
			}
		});

		it("should return AgentNotFoundError for non-existent agent", async () => {
			const result = await agentService.answer(authContext, "non-existent", "Test query");

			expect(result.isLeft()).toBeTruthy();
			if (result.isLeft()) {
				expect(result.value).toBeInstanceOf(AgentNotFoundError);
			}
		});
	});

	describe("system instruction injection", () => {
		it("should inject chat system instructions", async () => {
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Test Agent",
				systemInstructions: "Custom instructions",
			});

			if (createResult.isRight()) {
				// Spy on the AI model to verify system instructions
				const originalChat = aiModel.chat;
				let capturedSystemInstructions = "";

				aiModel.chat = async (text: string, options?: any) => {
					capturedSystemInstructions = options?.systemPrompt || "";
					return originalChat.call(aiModel, text, options);
				};

				await agentService.chat(authContext, createResult.value.uuid, "Test");

				// Verify injection occurred
				expect(capturedSystemInstructions).toContain(
					"You are an AI agent running inside Antbox",
				);
				expect(capturedSystemInstructions).toContain("Custom instructions");
				expect(capturedSystemInstructions).toContain(
					"Always detect and respond in the same language",
				);

				// Restore original method
				aiModel.chat = originalChat;
			}
		});

		it("should inject answer system instructions without language detection", async () => {
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Test Agent",
				systemInstructions: "Custom instructions",
			});

			if (createResult.isRight()) {
				// Spy on the AI model to verify system instructions
				const originalAnswer = aiModel.answer;
				let capturedSystemInstructions = "";

				aiModel.answer = async (text: string, options?: any) => {
					capturedSystemInstructions = options?.systemPrompt || "";
					return originalAnswer.call(aiModel, text, options);
				};

				await agentService.answer(authContext, createResult.value.uuid, "Test query");

				// Verify injection occurred without language detection
				expect(capturedSystemInstructions).toContain(
					"You are an AI agent running inside Antbox",
				);
				expect(capturedSystemInstructions).toContain("Custom instructions");
				expect(capturedSystemInstructions).not.toContain(
					"Always detect and respond in the same language",
				);

				// Restore original method
				aiModel.answer = originalAnswer;
			}
		});
	});

	describe("model resolution", () => {
		it("should use default model instance for 'default' model in chat", async () => {
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Default Model Agent",
				systemInstructions: "Test instructions",
				model: "default",
			});

			if (createResult.isRight()) {
				const agent = createResult.value;
				expect(agent.model).toBe("default");

				// Chat should work with default model instance
				const chatResult = await agentService.chat(authContext, agent.uuid, "Hello");

				expect(chatResult.isRight()).toBeTruthy();
				if (chatResult.isRight()) {
					const history = chatResult.value;
					const lastMessage = history[history.length - 1];
					expect(lastMessage.parts[0].text).toContain("Mock response to: Hello");
				}
			}
		});
	});

	describe("dynamic model loading", () => {
		it("should use default model instance for 'default' model name", async () => {
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Default Model Agent",
				systemInstructions: "Test instructions",
				model: "default",
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				// Chat should use the default model instance (our mock)
				const chatResult = await agentService.chat(
					authContext,
					createResult.value.uuid,
					"Hello",
				);

				expect(chatResult.isRight()).toBeTruthy();
				if (chatResult.isRight()) {
					const history = chatResult.value;
					const lastMessage = history[history.length - 1];
					expect(lastMessage.parts[0].text).toContain("Mock response to: Hello");
				}
			}
		});

		it("should use default model instance for custom model name", async () => {
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Custom Model Agent",
				systemInstructions: "Test instructions",
				model: "google/gemini-2.5-flash", // Custom model format
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				// This will attempt to load the model dynamically, but will fail in test environment
				const chatResult = await agentService.chat(
					authContext,
					createResult.value.uuid,
					"Test message",
				);

				expect(chatResult.isLeft()).toBeTruthy();
				if (chatResult.isLeft()) {
					expect(chatResult.value.message).toContain(
						"Could not load model: google/gemini-2.5-flash",
					);
				}
			}
		});

		it("should handle model loading failure gracefully", async () => {
			const createResult = await agentService.createOrReplace(authContext, {
				title: "Invalid Model Agent",
				systemInstructions: "Test instructions",
				model: "openai/invalid-model",
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				// Chat should fail with model error
				const chatResult = await agentService.chat(
					authContext,
					createResult.value.uuid,
					"Hello",
				);

				expect(chatResult.isLeft()).toBeTruthy();
				if (chatResult.isLeft()) {
					expect(chatResult.value.message).toContain(
						"Could not load model: openai/invalid-model",
					);
				}
			}
		});

		it("should pass files parameter to AI model", async () => {
			const createResult = await agentService.createOrReplace(authContext, {
				title: "File Processing Agent",
				systemInstructions: "You can process files",
				useTools: false,
			});

			expect(createResult.isRight()).toBeTruthy();
			if (createResult.isRight()) {
				const mockFile = new File(["test content"], "test.txt", { type: "text/plain" });

				// Chat with files
				const chatResult = await agentService.chat(
					authContext,
					createResult.value.uuid,
					"Process this file",
					{ files: [mockFile] },
				);

				expect(chatResult.isRight()).toBeTruthy();
				if (chatResult.isRight()) {
					const history = chatResult.value;
					const lastMessage = history[history.length - 1];
					expect(lastMessage.parts[0].text).toContain("Mock response to: Process this file");
				}

				// Answer with files
				const answerResult = await agentService.answer(
					authContext,
					createResult.value.uuid,
					"Analyze this file",
					{ files: [mockFile] },
				);

				expect(answerResult.isRight()).toBeTruthy();
				if (answerResult.isRight()) {
					expect(answerResult.value.parts[0].text).toContain(
						"Mock answer to: Analyze this file",
					);
				}
			}
		});
	});
});
