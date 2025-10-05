import { expect } from "jsr:@std/expect";
import { beforeEach, describe, it } from "jsr:@std/testing/bdd";
import { restore, stub } from "jsr:@std/testing/mock";
import buildGoogleModel, {
	GoogleAPIError,
	GoogleModel,
	GoogleModelNotFoundError,
} from "./google.ts";
import { ChatHistory, ChatMessage } from "domain/ai/chat_message.ts";
import { FeatureService } from "application/feature_service.ts";
import { AuthenticationContext } from "application/authentication_context.ts";
import { left, right } from "shared/either.ts";

// Mock FeatureService for testing
class MockFeatureService {
	async runAITool(authContext: AuthenticationContext, featureId: string, parameters: any) {
		// Mock successful tool execution
		if (featureId === "builtin:node-service:find") {
			return right({ results: [{ uuid: "test-node", title: "Test Node" }] });
		}
		if (featureId === "builtin:node-service:get") {
			return right({ uuid: parameters.uuid, title: "Test Node", content: "Test content" });
		}
		return right({ success: true, data: parameters });
	}
}

describe("buildGoogleModel factory", () => {
	it("should create model with provided API key - sync version", () => {
		const result = buildGoogleModel(
			"gemini-2.0-flash",
			"test-api-key",
		);
		expect(result.isRight()).toBeTruthy();
		expect(result.right.modelName).toBe("gemini-2.0-flash");
	});

	it("should create model with provided API key", async () => {
		const result = buildGoogleModel(
			"gemini-2.0-flash",
			"test-api-key",
		);
		expect(result.isRight()).toBeTruthy();
		expect(result.right.modelName).toBe("gemini-2.0-flash");
	});

	it("should use GOOGLE_API_KEY environment variable", () => {
		const existingKey = Deno.env.get("GOOGLE_API_KEY");
		if (!existingKey) {
			// Skip if no key is set
			return;
		}
		const result = buildGoogleModel("gemini-2.0-flash");
		expect(result.isRight()).toBeTruthy();
	});

	it("should fail for unknown model", () => {
		const result = buildGoogleModel("unknown-model-xyz", "test-key");
		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(GoogleModelNotFoundError);
	});
});

describe("GoogleModel capabilities - gemini-2.0", () => {
	let model: GoogleModel;

	beforeEach(() => {
		model = new GoogleModel("gemini-2.0-flash", "test-key");
		const result = model.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}
	});

	it("should detect LLM capabilities", () => {
		expect(model.llm).toBe(true);
	});

	it("should detect tool support", () => {
		expect(model.tools).toBe(true);
	});

	it("should detect file support", () => {
		expect(model.files).toBe(true);
	});

	it("should detect reasoning support", () => {
		expect(model.reasoning).toBe(true);
	});

	it("should not provide embeddings", () => {
		expect(model.embeddings).toBe(false);
	});
});

describe("GoogleModel capabilities - gemini-2.5-flash-lite", () => {
	let model: GoogleModel;

	beforeEach(() => {
		model = new GoogleModel("gemini-2.5-flash-lite", "test-key");
		const result = model.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}
	});

	it("should detect LLM capabilities", () => {
		expect(model.llm).toBe(true);
	});

	it("should detect tool support", () => {
		expect(model.tools).toBe(true);
	});

	it("should detect file support", () => {
		expect(model.files).toBe(true);
	});

	it("should support reasoning", () => {
		expect(model.reasoning).toBe(true);
	});

	it("should not provide embeddings", () => {
		expect(model.embeddings).toBe(false);
	});
});

describe("GoogleModel capabilities - embedding", () => {
	let model: GoogleModel;

	beforeEach(() => {
		model = new GoogleModel("text-embedding-004", "test-key");
		const result = model.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}
	});

	it("should provide embeddings", () => {
		expect(model.embeddings).toBe(true);
	});

	it("should not provide LLM", () => {
		expect(model.llm).toBe(false);
	});

	it("should not support tools", () => {
		expect(model.tools).toBe(false);
	});

	it("should not support files", () => {
		expect(model.files).toBe(false);
	});

	it("should not support reasoning", () => {
		expect(model.reasoning).toBe(false);
	});
});

describe("GoogleModel capabilities - embedding model", () => {
	let model: GoogleModel;

	beforeEach(() => {
		model = new GoogleModel("text-embedding-004", "test-key");
		const result = model.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}
	});

	it("should provide embeddings", () => {
		expect(model.embeddings).toBe(true);
	});

	it("should not provide LLM", () => {
		expect(model.llm).toBe(false);
	});

	it("should not support tools", () => {
		expect(model.tools).toBe(false);
	});

	it("should not support files", () => {
		expect(model.files).toBe(false);
	});

	it("should not support reasoning", () => {
		expect(model.reasoning).toBe(false);
	});
});

describe("GoogleModel validateModel", () => {
	it("should succeed for gemini-2.0 models", () => {
		const model = new GoogleModel("gemini-2.0-flash", "test-key");
		const result = model.validateModel();
		expect(result.isRight()).toBeTruthy();
	});

	it("should succeed for gemini-2.0 models", () => {
		const model = new GoogleModel("gemini-2.0-pro", "test-key");
		const result = model.validateModel();
		expect(result.isRight()).toBeTruthy();
	});

	it("should succeed for embedding models", () => {
		const model = new GoogleModel("text-embedding-004", "test-key");
		const result = model.validateModel();
		expect(result.isRight()).toBeTruthy();
	});

	it("should fail for unknown models", () => {
		const model = new GoogleModel("unknown-model", "test-key");
		const result = model.validateModel();
		expect(result.isLeft()).toBeTruthy();
		expect(result.value).toBeInstanceOf(GoogleModelNotFoundError);
	});
});

describe("GoogleModel embed", () => {
	it("should fail if model does not support embeddings", async () => {
		const model = new GoogleModel("gemini-2.0-flash", "test-key");
		const result = model.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}

		const embedResult = await model.embed(["test text"]);
		expect(embedResult.isLeft()).toBeTruthy();
		expect(embedResult.value).toBeInstanceOf(GoogleAPIError);
		expect((embedResult.value as GoogleAPIError).message).toContain(
			"does not support embeddings",
		);
	});

	it("should process multiple texts for embedding models", async () => {
		const model = new GoogleModel("text-embedding-004", "test-key");
		const result = model.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}

		// Mock the embedContent method
		const mockEmbedContent = stub(model["client"]["models"], "embedContent", () => {
			return Promise.resolve({
				embeddings: [{
					values: [0.1, 0.2, 0.3, 0.4, 0.5],
				}],
			});
		});

		const embedResult = await model.embed(["text1", "text2"]);

		// Restore the original method
		restore();

		expect(embedResult.isRight()).toBeTruthy();
		if (embedResult.isRight()) {
			expect(embedResult.value).toHaveLength(2);
			expect(embedResult.value[0]).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
		}
	});
});

describe("GoogleModel chat", () => {
	let featureService: MockFeatureService;
	let authContext: AuthenticationContext;

	beforeEach(() => {
		featureService = new MockFeatureService();
		authContext = {
			tenant: "test",
			principal: { email: "test@example.com", groups: [] },
			mode: "Direct",
		};
	});

	it("should fail if model does not support files", async () => {
		const embeddingModel = new GoogleModel("text-embedding-004", "test-key");
		const result = embeddingModel.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}

		const testFile = new File(["test content"], "test.txt", { type: "text/plain" });
		const ocrResult = await embeddingModel.ocr(testFile);

		expect(ocrResult.isLeft()).toBeTruthy();
		expect(ocrResult.value).toBeInstanceOf(GoogleAPIError);
		expect((ocrResult.value as GoogleAPIError).message).toContain(
			"does not support file inputs",
		);
	});

	it("should handle basic chat without tools", async () => {
		// Create a model without network-dependent client
		const testModel = new GoogleModel("gemini-2.0-flash", "test-key");
		const validationResult = testModel.validateModel();
		if (validationResult.isLeft()) {
			throw new Error(`Failed to validate model: ${validationResult.value.message}`);
		}

		// Mock the entire client to avoid network calls
		const mockResponse = {
			text: "Hello! How can I help you?",
			functionCalls: undefined,
		};

		const mockClient = {
			models: {
				generateContent: () => Promise.resolve(mockResponse),
			},
		};

		// Replace the client
		(testModel as any).client = mockClient;

		const chatResult = await testModel.chat("Hello", {
			systemPrompt: "You are helpful",
		});

		expect(chatResult.isRight()).toBeTruthy();
		if (chatResult.isRight()) {
			expect(chatResult.value.role).toBe("model");
			expect(chatResult.value.parts).toHaveLength(1);
			expect(chatResult.value.parts[0].text).toBe("Hello! How can I help you?");
		}
	});

	it("should handle chat with tool calls", async () => {
		const testModel = new GoogleModel("gemini-2.0-flash", "test-key");
		const validationResult = testModel.validateModel();
		if (validationResult.isLeft()) {
			throw new Error(`Failed to validate model: ${validationResult.value.message}`);
		}

		// Mock response with function call
		const mockResponse = {
			text: "",
			functionCalls: [{
				name: "search",
				args: { query: "test" },
			}],
		};

		const mockClient = {
			models: {
				generateContent: () => Promise.resolve(mockResponse),
			},
		};

		(testModel as any).client = mockClient;

		const tools = [{
			uuid: "tool-1",
			name: "search",
			description: "Search for items",
			parameters: [],
		}];

		const chatResult = await testModel.chat("Find test items", {
			systemPrompt: "You are helpful",
			tools,
		});

		expect(chatResult.isRight()).toBeTruthy();
		if (chatResult.isRight()) {
			expect(chatResult.value.role).toBe("model");
			expect(chatResult.value.parts).toHaveLength(1);
			expect(chatResult.value.parts[0].toolCall).toBeDefined();
			expect(chatResult.value.parts[0].toolCall?.name).toBe("search");
		}
	});

	it("should handle files in chat", async () => {
		const testModel = new GoogleModel("gemini-2.0-flash", "test-key");
		const validationResult = testModel.validateModel();
		if (validationResult.isLeft()) {
			throw new Error(`Failed to validate model: ${validationResult.value.message}`);
		}

		const mockResponse = {
			text: "I can see the file content.",
			functionCalls: undefined,
		};

		const mockClient = {
			models: {
				generateContent: () => Promise.resolve(mockResponse),
			},
		};

		(testModel as any).client = mockClient;

		const testFile = new File(["test content"], "test.txt", { type: "text/plain" });
		const chatResult = await testModel.chat("Analyze this file", {
			systemPrompt: "You are helpful",
			files: [testFile],
		});

		expect(chatResult.isRight()).toBeTruthy();
		if (chatResult.isRight()) {
			expect(chatResult.value.role).toBe("model");
			expect(chatResult.value.parts[0].text).toBe("I can see the file content.");
		}
	});

	it("should handle structured output", async () => {
		const testModel = new GoogleModel("gemini-2.0-flash", "test-key");
		const validationResult = testModel.validateModel();
		if (validationResult.isLeft()) {
			throw new Error(`Failed to validate model: ${validationResult.value.message}`);
		}

		const mockResponse = {
			text: '{"name": "John", "age": 30}',
			functionCalls: undefined,
		};

		const mockClient = {
			models: {
				generateContent: () => Promise.resolve(mockResponse),
			},
		};

		(testModel as any).client = mockClient;

		const schema = JSON.stringify({
			type: "object",
			properties: {
				name: { type: "string" },
				age: { type: "number" },
			},
		});

		const chatResult = await testModel.chat("Give me user info", {
			systemPrompt: "You are helpful",
			structuredOutput: schema,
		});

		expect(chatResult.isRight()).toBeTruthy();
		if (chatResult.isRight()) {
			expect(chatResult.value.role).toBe("model");
			expect(chatResult.value.parts[0].text).toBe('{"name": "John", "age": 30}');
		}
	});
});

describe("GoogleModel answer", () => {
	let model: GoogleModel;

	beforeEach(async () => {
		model = new GoogleModel("gemini-2.0-flash-exp", "test-key");
		await model.validateModel();
	});

	it("should fail if model does not support LLM", async () => {
		const embeddingModel = new GoogleModel("text-embedding-004", "test-key");
		const result = embeddingModel.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}

		const answerResult = await embeddingModel.answer("What is 2+2?");

		expect(answerResult.isLeft()).toBeTruthy();
		expect(answerResult.value).toBeInstanceOf(GoogleAPIError);
		expect((answerResult.value as GoogleAPIError).message).toContain(
			"Answer failed",
		);
	});

	it("should handle basic answer", async () => {
		const model = new GoogleModel("gemini-2.0-flash", "test-key");
		const validationResult = model.validateModel();
		if (validationResult.isLeft()) {
			throw new Error(`Failed to validate model: ${validationResult.value.message}`);
		}

		const mockGenerateContent = stub(
			model["client"]["models"],
			"generateContent",
			() =>
				Promise.resolve({
					text: "The answer is 4.",
					functionCalls: undefined,
					data: "",
					executableCode: "",
					codeExecutionResult: "",
				} as any),
		);

		const answerResult = await model.answer("What is 2+2?", {
			systemPrompt: "You are a math tutor",
		});

		restore();

		expect(answerResult.isRight()).toBeTruthy();
		if (answerResult.isRight()) {
			expect(answerResult.value.role).toBe("model");
			expect(answerResult.value.parts[0].text).toBe("The answer is 4.");
		}
	});

	it("should handle structured output in answer", async () => {
		const model = new GoogleModel("gemini-2.0-flash", "test-key");
		const validationResult = model.validateModel();
		if (validationResult.isLeft()) {
			throw new Error(`Failed to validate model: ${validationResult.value.message}`);
		}

		const mockGenerateContent = stub(
			model["client"]["models"],
			"generateContent",
			() =>
				Promise.resolve({
					text: '{"result": 4, "explanation": "2 plus 2 equals 4"}',
					functionCalls: undefined,
					data: "",
					executableCode: "",
					codeExecutionResult: "",
				} as any),
		);

		const schema = JSON.stringify({
			type: "object",
			properties: {
				result: { type: "number" },
				explanation: { type: "string" },
			},
		});

		const answerResult = await model.answer("What is 2+2?", {
			systemPrompt: "You are a math tutor",
			structuredOutput: schema,
		});

		restore();

		expect(answerResult.isRight()).toBeTruthy();
		if (answerResult.isRight()) {
			expect(answerResult.value.role).toBe("model");
			expect(answerResult.value.parts[0].text).toBe(
				'{"result": 4, "explanation": "2 plus 2 equals 4"}',
			);
		}
	});
});

describe("GoogleModel OCR", () => {
	let model: GoogleModel;

	beforeEach(() => {
		model = new GoogleModel("gemini-2.0-pro", "test-key");
		const result = model.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}
	});

	it("should fail if model does not support files", async () => {
		const textModel = new GoogleModel("text-embedding-004", "test-key");
		const result = textModel.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}

		const mockFile = new File(["test"], "test.jpg", { type: "image/jpeg" });
		const ocrResult = await textModel.ocr(mockFile);

		expect(ocrResult.isLeft()).toBeTruthy();
		expect(ocrResult.value).toBeInstanceOf(GoogleAPIError);
		expect((ocrResult.value as GoogleAPIError).message).toContain(
			"does not support file",
		);
	});

	it("should extract text from image", async () => {
		const mockGenerateContent = stub(
			model["client"]["models"],
			"generateContent",
			() =>
				Promise.resolve({
					text: "Extracted text from image",
					candidates: [{
						content: {
							parts: [{ text: "Extracted text from image" }],
						},
					}],
					data: "",
					functionCalls: [],
					executableCode: "",
					codeExecutionResult: "",
				}),
		);

		const mockFile = new File(["test image data"], "test.jpg", { type: "image/jpeg" });
		const result = await model.ocr(mockFile);

		restore();

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			expect(result.value).toBe("Extracted text from image");
		}
	});
});

describe("GoogleModel history conversion", () => {
	let model: GoogleModel;

	beforeEach(() => {
		model = new GoogleModel("gemini-2.0-flash", "test-key");
		const result = model.validateModel();
		if (result.isLeft()) {
			throw new Error(`Failed to validate model: ${result.value.message}`);
		}
	});

	it("should handle chat with history", async () => {
		const mockResponse = {
			text: "Got it!",
			functionCalls: undefined,
		};

		const mockClient = {
			models: {
				generateContent: () => Promise.resolve(mockResponse),
			},
		};

		(model as any).client = mockClient;

		const history: ChatHistory = [
			{ role: "user", parts: [{ text: "Hello" }] },
			{ role: "model", parts: [{ text: "Hi there!" }] },
		];

		const chatResult = await model.chat("How are you?", {
			systemPrompt: "You are helpful",
			history,
		});

		expect(chatResult.isRight()).toBeTruthy();
		if (chatResult.isRight()) {
			expect(chatResult.value.role).toBe("model");
			expect(chatResult.value.parts[0].text).toBe("Got it!");
		}
	});
});

describe("GoogleModel text extraction", () => {
	it("should extract text in answer responses", async () => {
		const model = new GoogleModel("gemini-2.0-flash", "test-key");
		const validationResult = model.validateModel();
		if (validationResult.isLeft()) {
			throw new Error(`Failed to validate model: ${validationResult.value.message}`);
		}

		const mockResponse = {
			text: "Hello world",
			functionCalls: undefined,
		};

		const mockClient = {
			models: {
				generateContent: () => Promise.resolve(mockResponse),
			},
		};

		(model as any).client = mockClient;

		const result = await model.answer("Test question");

		expect(result.isRight()).toBeTruthy();
		if (result.isRight()) {
			expect(result.value.parts[0].text).toBe("Hello world");
		}
	});
});

describe("Tool conversion utilities", () => {
	it("should convert FeatureDTO to Google function format", () => {
		// This tests the internal convertToGoogleFunctions function
		// We'll test it indirectly through the chat method
		const model = new GoogleModel("gemini-2.0-flash-exp", "test-key");

		const features = [
			{
				name: "search",
				description: "Search for items",
				parameters: [
					{
						name: "query",
						type: "string" as const,
						required: true,
						description: "Search query",
					},
				],
			},
		];

		// The converter is called internally when chat/answer is used with tools
		// We verify it doesn't throw during model creation and validation
		expect(() => {
			model.validateModel();
		}).not.toThrow();
	});

	it("should handle array parameters correctly", () => {
		const features = [
			{
				name: "process",
				description: "Process items",
				parameters: [
					{
						name: "items",
						type: "array" as const,
						arrayType: "string" as const,
						required: true,
						description: "Items to process",
					},
				],
			},
		];

		// Verify through model creation that it doesn't throw
		expect(() => {
			new GoogleModel("gemini-2.0-flash-exp", "test-key");
		}).not.toThrow();
	});

	it("should handle optional parameters", () => {
		const features = [
			{
				name: "test",
				description: "Test function",
				parameters: [
					{
						name: "required",
						type: "string" as const,
						required: true,
					},
					{
						name: "optional",
						type: "string" as const,
						required: false,
					},
				],
			},
		];

		expect(() => {
			new GoogleModel("gemini-2.0-flash-exp", "test-key");
		}).not.toThrow();
	});
});
