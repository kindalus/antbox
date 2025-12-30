import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { AIModel, Embedding } from "application/ai/ai_model.ts";
import type { ChatHistory, ChatMessage, ToolCall } from "domain/ai/chat_message.ts";
import type {
	FeatureData,
	FeatureParameter,
	FeatureParameterType,
} from "domain/configuration/feature_data.ts";

// ============================================================================
// TYPES
// ============================================================================

interface OllamaMessage {
	role: "user" | "assistant" | "system";
	content: string;
	images?: string[];
	tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
	function: {
		name: string;
		arguments: Record<string, unknown>;
	};
}

interface OllamaTool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: {
			type: "object";
			properties: Record<string, OllamaPropertySchema>;
			required?: string[];
		};
	};
}

interface OllamaPropertySchema {
	type: string;
	description?: string;
	items?: { type: string };
}

interface OllamaChatResponse {
	model: string;
	created_at: string;
	message: OllamaMessage;
	done: boolean;
	total_duration?: number;
	load_duration?: number;
	prompt_eval_count?: number;
	prompt_eval_duration?: number;
	eval_count?: number;
	eval_duration?: number;
}

interface OllamaEmbeddingResponse {
	model: string;
	embeddings: number[][];
}

interface OllamaListResponse {
	models: Array<{
		name: string;
		model: string;
		modified_at: string;
		size: number;
		digest: string;
	}>;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Builds an Ollama AIModel instance.
 *
 * @remarks
 * External setup:
 * - Install and run Ollama (`ollama serve`).
 * - Pull the model (`ollama pull <model>`).
 * - Ensure the process can reach the Ollama base URL (`--allow-net` in Deno).
 *
 * @param modelName The name of the Ollama model (e.g., "llama3.2", "mistral", "nomic-embed-text").
 * @param baseUrl Optional base URL (defaults to `OLLAMA_BASE_URL` or `http://localhost:11434`).
 *
 * @example
 * const modelOrErr = buildOllamaModel("llama3.2");
 * if (modelOrErr.isRight()) {
 *   const model = modelOrErr.value;
 * }
 */
export default function buildOllamaModel(
	modelName: string,
	baseUrl?: string,
): Either<AntboxError, AIModel> {
	const url = baseUrl ?? Deno.env.get("OLLAMA_BASE_URL") ?? "http://localhost:11434";

	const model = new OllamaModel(modelName, url);

	const validation = model.validateModel();
	if (validation.isLeft()) {
		return left(validation.value);
	}

	return right(model);
}

// ============================================================================
// OLLAMA MODEL CLASS
// ============================================================================

export class OllamaModel implements AIModel {
	readonly modelName: string;
	embeddings: boolean = false;
	llm: boolean = false;
	tools: boolean = false;
	files: boolean = false;
	reasoning: boolean = false;

	readonly #baseUrl: string;

	constructor(name: string, baseUrl: string) {
		this.modelName = name;
		this.#baseUrl = baseUrl;
	}

	validateModel(): Either<AntboxError, void> {
		// Ollama allows any model name - validation happens at runtime when model is pulled/loaded
		// Set capabilities based on model name patterns
		this.embeddings = modelProvidesEmbeddings(this.modelName);
		this.llm = modelProvidesLLM(this.modelName);
		this.tools = modelSupportsTools(this.modelName);
		this.files = modelSupportsFiles(this.modelName);
		this.reasoning = modelSupportsReasoning(this.modelName);

		return right(undefined);
	}

	async embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>> {
		if (!this.embeddings) {
			return left(new OllamaAPIError("Model does not support embeddings"));
		}

		try {
			const response = await fetch(`${this.#baseUrl}/api/embed`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.modelName,
					input: texts,
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				return left(new OllamaAPIError(`Embedding request failed: ${error}`));
			}

			const data: OllamaEmbeddingResponse = await response.json();

			return right(data.embeddings);
		} catch (error) {
			return left(new OllamaAPIError(`Embedding failed: ${error}`));
		}
	}

	async chat(
		input: string | ChatMessage,
		options?: {
			systemPrompt?: string;
			history?: ChatHistory;
			tools?: Partial<FeatureData>[];
			files?: File[];
			temperature?: number;
			maxTokens?: number;
			reasoning?: boolean;
			structuredOutput?: string;
		},
	): Promise<Either<AntboxError, ChatMessage>> {
		if (!this.llm) {
			return left(new OllamaAPIError("Model does not support LLM"));
		}

		try {
			const messages: OllamaMessage[] = [];

			if (options?.systemPrompt) {
				messages.push({ role: "system", content: options.systemPrompt });
			}

			if (options?.history?.length) {
				messages.push(...options.history.map((m) => this.#toOllamaMessage(m)));
			}

			if (typeof input === "string") {
				messages.push({ role: "user", content: input });
			} else {
				messages.push(await this.#toOllamaMessageWithFiles(input, options?.files));
			}

			const requestBody: Record<string, unknown> = {
				model: this.modelName,
				messages,
				stream: false,
			};

			const ollamaOptions: Record<string, unknown> = {};

			if (options?.temperature !== undefined) {
				ollamaOptions.temperature = options.temperature;
			}

			if (options?.maxTokens !== undefined) {
				ollamaOptions.num_predict = options.maxTokens;
			}

			if (Object.keys(ollamaOptions).length > 0) {
				requestBody.options = ollamaOptions;
			}

			if (options?.tools?.length && this.tools) {
				requestBody.tools = options.tools.map(OllamaModel.#toOllamaTool);
			}

			if (options?.structuredOutput) {
				try {
					requestBody.format = JSON.parse(options.structuredOutput);
				} catch {
					// Ignore malformed schema
				}
			}

			const response = await fetch(`${this.#baseUrl}/api/chat`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const error = await response.text();
				return left(new OllamaAPIError(`Chat request failed: ${error}`));
			}

			const data: OllamaChatResponse = await response.json();
			const msg = this.#extractMessage(data);

			return right(msg);
		} catch (error) {
			return left(new OllamaAPIError(`Chat failed: ${error}`));
		}
	}

	async answer(
		input: string | ChatMessage,
		options?: {
			systemPrompt?: string;
			tools?: Partial<FeatureData>[];
			files?: File[];
			temperature?: number;
			maxTokens?: number;
			reasoning?: boolean;
			structuredOutput?: string;
		},
	): Promise<Either<AntboxError, ChatMessage>> {
		return this.chat(input, options);
	}

	async ocr(file: File): Promise<Either<AntboxError, string>> {
		if (!this.files) {
			return left(new OllamaAPIError("Model does not support file inputs"));
		}

		try {
			const base64Data = await this.#fileToBase64(file);

			const response = await fetch(`${this.#baseUrl}/api/chat`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.modelName,
					messages: [{
						role: "user",
						content: "Extract all text from this image/document.",
						images: [base64Data],
					}],
					stream: false,
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				return left(new OllamaAPIError(`OCR request failed: ${error}`));
			}

			const data: OllamaChatResponse = await response.json();

			return right(data.message.content);
		} catch (error) {
			return left(new OllamaAPIError(`OCR failed: ${error}`));
		}
	}

	/**
	 * List available models on the Ollama server
	 */
	async listModels(): Promise<Either<AntboxError, string[]>> {
		try {
			const response = await fetch(`${this.#baseUrl}/api/tags`, {
				method: "GET",
			});

			if (!response.ok) {
				const error = await response.text();
				return left(new OllamaAPIError(`List models request failed: ${error}`));
			}

			const data: OllamaListResponse = await response.json();
			const models = data.models.map((m) => m.name);

			return right(models);
		} catch (error) {
			return left(new OllamaAPIError(`List models failed: ${error}`));
		}
	}

	/**
	 * Check if Ollama server is running
	 */
	async isServerRunning(): Promise<boolean> {
		try {
			const response = await fetch(`${this.#baseUrl}/api/tags`);
			return response.ok;
		} catch {
			return false;
		}
	}

	#toOllamaMessage(message: ChatMessage): OllamaMessage {
		const role = message.role === "model" ? "assistant" : "user";
		const textParts: string[] = [];
		const toolCalls: OllamaToolCall[] = [];

		for (const part of message.parts) {
			if (part.text) {
				textParts.push(part.text);
			} else if (part.toolCall) {
				toolCalls.push({
					function: {
						name: part.toolCall.name,
						arguments: part.toolCall.args,
					},
				});
			} else if (part.toolResponse) {
				// Tool responses are typically sent as user messages in Ollama
				textParts.push(`Tool ${part.toolResponse.name} result: ${part.toolResponse.text}`);
			}
		}

		const msg: OllamaMessage = {
			role,
			content: textParts.join("\n"),
		};

		if (toolCalls.length > 0) {
			msg.tool_calls = toolCalls;
		}

		return msg;
	}

	async #toOllamaMessageWithFiles(
		message: ChatMessage,
		files?: File[],
	): Promise<OllamaMessage> {
		const ollamaMessage = this.#toOllamaMessage(message);

		if (files && files.length > 0 && this.files) {
			const images: string[] = [];
			for (const file of files) {
				if (file.type.startsWith("image/")) {
					const base64Data = await this.#fileToBase64(file);
					images.push(base64Data);
				}
			}
			if (images.length > 0) {
				ollamaMessage.images = images;
			}
		}

		return ollamaMessage;
	}

	#extractMessage(response: OllamaChatResponse): ChatMessage {
		const msg: ChatMessage = { role: "model", parts: [] };

		if (response.message.tool_calls && response.message.tool_calls.length > 0) {
			for (const toolCall of response.message.tool_calls) {
				msg.parts.push({
					toolCall: {
						name: toolCall.function.name,
						args: toolCall.function.arguments,
					} as ToolCall,
				});
			}
		} else if (response.message.content) {
			msg.parts.push({ text: response.message.content });
		}

		return msg;
	}

	async #fileToBase64(file: File): Promise<string> {
		const arrayBuffer = await file.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		let binary = "";
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	static #toOllamaTool(feature: Partial<FeatureData>): OllamaTool {
		const properties: Record<string, OllamaPropertySchema> = {};
		const required: string[] = [];

		for (const param of feature.parameters ?? []) {
			properties[param.name] = OllamaModel.#toPropertySchema(param);
			if (param.required) {
				required.push(param.name);
			}
		}

		return {
			type: "function",
			function: {
				name: feature.uuid!,
				description: feature.description || "",
				parameters: {
					type: "object",
					properties,
					required: required.length > 0 ? required : undefined,
				},
			},
		};
	}

	static #toPropertySchema(param: FeatureParameter): OllamaPropertySchema {
		const schema: OllamaPropertySchema = {
			type: OllamaModel.#convertParameterType(param.type),
			description: param.description,
		};

		if (param.type === "array" && param.arrayType) {
			schema.items = { type: OllamaModel.#convertParameterType(param.arrayType) };
		}

		return schema;
	}

	static #convertParameterType(type: FeatureParameterType | string): string {
		switch (type) {
			case "string":
				return "string";
			case "number":
				return "number";
			case "boolean":
				return "boolean";
			case "array":
				return "array";
			default:
				return "object";
		}
	}
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class OllamaModelNotFoundError extends AntboxError {
	constructor(modelName: string) {
		super("OllamaModelNotFound", `Ollama model ${modelName} not found`);
	}
}

export class OllamaAPIError extends AntboxError {
	constructor(message: string) {
		super("OllamaAPIError", `Ollama API error: ${message}`);
	}
}

export class OllamaServerNotRunningError extends AntboxError {
	constructor(baseUrl: string) {
		super("OllamaServerNotRunning", `Ollama server not running at ${baseUrl}`);
	}
}

// ============================================================================
// MODEL LISTS & CAPABILITIES
// ============================================================================

/**
 * Common embedding models in Ollama
 */
const EMBEDDING_MODEL_PATTERNS = [
	"nomic-embed",
	"mxbai-embed",
	"all-minilm",
	"snowflake-arctic-embed",
	"bge-",
];

/**
 * Common vision/multimodal models in Ollama
 */
const VISION_MODEL_PATTERNS = [
	"llava",
	"bakllava",
	"moondream",
	"minicpm-v",
];

/**
 * Models known to support function calling/tools
 */
const TOOL_MODEL_PATTERNS = [
	"llama3",
	"mistral",
	"mixtral",
	"qwen",
	"command-r",
	"firefunction",
];

/**
 * Models known to support reasoning
 */
const REASONING_MODEL_PATTERNS = [
	"deepseek-r1",
	"qwq",
];

/**
 * Check if a model provides embeddings based on name patterns
 */
function modelProvidesEmbeddings(modelName: string): boolean {
	const lowerName = modelName.toLowerCase();
	return EMBEDDING_MODEL_PATTERNS.some((pattern) => lowerName.includes(pattern));
}

/**
 * Check if a model provides LLM capabilities
 * Most Ollama models are LLMs unless they're embedding-only models
 */
function modelProvidesLLM(modelName: string): boolean {
	// If it's an embedding model, it's not an LLM
	return !modelProvidesEmbeddings(modelName);
}

/**
 * Check if a model supports tools/function calling
 */
function modelSupportsTools(modelName: string): boolean {
	const lowerName = modelName.toLowerCase();
	return TOOL_MODEL_PATTERNS.some((pattern) => lowerName.includes(pattern));
}

/**
 * Check if a model supports file/image inputs
 */
function modelSupportsFiles(modelName: string): boolean {
	const lowerName = modelName.toLowerCase();
	return VISION_MODEL_PATTERNS.some((pattern) => lowerName.includes(pattern));
}

/**
 * Check if a model supports reasoning
 */
function modelSupportsReasoning(modelName: string): boolean {
	const lowerName = modelName.toLowerCase();
	return REASONING_MODEL_PATTERNS.some((pattern) => lowerName.includes(pattern));
}
