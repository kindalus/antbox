import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { AIModel, Embedding } from "application/ai/ai_model.ts";
import type { ChatHistory, ChatMessage, ToolCall, ToolResponse } from "domain/ai/chat_message.ts";
import type {
	FeatureData,
	FeatureParameter,
	FeatureParameterType,
} from "domain/configuration/feature_data.ts";

// ============================================================================
// TYPES
// ============================================================================

interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string | null;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
	name?: string;
}

interface OpenAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

interface OpenAITool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: {
			type: "object";
			properties: Record<string, OpenAIPropertySchema>;
			required?: string[];
		};
	};
}

interface OpenAIPropertySchema {
	type: string;
	description?: string;
	items?: { type: string };
}

interface OpenAIChatResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: {
		index: number;
		message: OpenAIMessage;
		finish_reason: string;
	}[];
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

interface OpenAIEmbeddingResponse {
	object: string;
	data: {
		object: string;
		embedding: number[];
		index: number;
	}[];
	model: string;
	usage: {
		prompt_tokens: number;
		total_tokens: number;
	};
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Builds an OpenAI AIModel instance.
 *
 * @remarks
 * External setup:
 * - Create an OpenAI API key and set `OPENAI_API_KEY` (or pass `apiKey`).
 * - Ensure the process can reach `https://api.openai.com` (`--allow-net` in Deno).
 *
 * @param modelName The name of the OpenAI model (e.g., "gpt-4o", "gpt-4o-mini", "text-embedding-3-small").
 * @param apiKey Optional API key (defaults to `OPENAI_API_KEY`).
 *
 * @example
 * const modelOrErr = buildOpenAIModel("gpt-4o-mini");
 * if (modelOrErr.isRight()) {
 *   const model = modelOrErr.value;
 * }
 */
export default function buildOpenAIModel(
	modelName: string,
	apiKey?: string,
): Either<AntboxError, AIModel> {
	const key = apiKey ?? Deno.env.get("OPENAI_API_KEY");

	if (!key) {
		Logger.error(
			"FATAL: OpenAI API key not provided and OPENAI_API_KEY environment variable not set",
		);
		Deno.exit(1);
	}

	const model = new OpenAIModel(modelName, key);

	const validation = model.validateModel();
	if (validation.isLeft()) {
		return left(validation.value);
	}

	return right(model);
}

// ============================================================================
// OPENAI MODEL CLASS
// ============================================================================

export class OpenAIModel implements AIModel {
	readonly modelName: string;
	embeddings: boolean = false;
	llm: boolean = false;
	tools: boolean = false;
	files: boolean = false;
	reasoning: boolean = false;

	readonly #apiKey: string;
	readonly #baseUrl = "https://api.openai.com/v1";

	constructor(name: string, apiKey: string) {
		this.modelName = name;
		this.#apiKey = apiKey;
	}

	validateModel(): Either<AntboxError, void> {
		if (!isValidModel(this.modelName)) {
			return left(new OpenAIModelNotFoundError(this.modelName));
		}

		this.embeddings = modelProvidesEmbeddings(this.modelName);
		this.llm = modelProvidesLLM(this.modelName);
		this.tools = modelSupportsTools(this.modelName);
		this.files = modelSupportsFiles(this.modelName);
		this.reasoning = modelSupportsReasoning(this.modelName);

		return right(undefined);
	}

	async embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>> {
		if (!this.embeddings) {
			return left(new OpenAIAPIError("Model does not support embeddings"));
		}

		try {
			const response = await fetch(`${this.#baseUrl}/embeddings`, {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${this.#apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.modelName,
					input: texts,
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				return left(new OpenAIAPIError(`Embedding request failed: ${error}`));
			}

			const data: OpenAIEmbeddingResponse = await response.json();
			const embeddings = data.data
				.sort((a, b) => a.index - b.index)
				.map((item) => item.embedding);

			return right(embeddings);
		} catch (error) {
			return left(new OpenAIAPIError(`Failed to generate embeddings: ${error}`));
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
			return left(new OpenAIAPIError("Model does not support LLM"));
		}

		try {
			const messages: OpenAIMessage[] = [];

			if (options?.systemPrompt) {
				messages.push({ role: "system", content: options.systemPrompt });
			}

			if (options?.history?.length) {
				messages.push(...options.history.map((m) => this.#toOpenAIMessage(m)));
			}

			if (typeof input === "string") {
				messages.push({ role: "user", content: input });
			} else {
				messages.push(this.#toOpenAIMessage(input));
			}

			const requestBody: Record<string, unknown> = {
				model: this.modelName,
				messages,
			};

			if (options?.temperature !== undefined) {
				requestBody.temperature = options.temperature;
			}

			if (options?.maxTokens !== undefined) {
				requestBody.max_tokens = options.maxTokens;
			}

			if (options?.tools?.length && this.tools) {
				requestBody.tools = options.tools.map(OpenAIModel.#toOpenAITool);
			}

			if (options?.structuredOutput) {
				try {
					requestBody.response_format = {
						type: "json_schema",
						json_schema: {
							name: "response",
							schema: JSON.parse(options.structuredOutput),
						},
					};
				} catch {
					// Ignore malformed schema
				}
			}

			const response = await fetch(`${this.#baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${this.#apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const error = await response.text();
				return left(new OpenAIAPIError(`Chat request failed: ${error}`));
			}

			const data: OpenAIChatResponse = await response.json();
			const msg = this.#extractMessage(data);

			return right(msg);
		} catch (error) {
			return left(new OpenAIAPIError(`Chat failed: ${error}`));
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
			return left(new OpenAIAPIError("Model does not support file inputs"));
		}

		try {
			const base64Data = await this.#fileToBase64(file);
			const dataUrl = `data:${file.type};base64,${base64Data}`;

			const response = await fetch(`${this.#baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${this.#apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.modelName,
					messages: [{
						role: "user",
						content: [
							{ type: "text", text: "Extract all text from this image/document." },
							{ type: "image_url", image_url: { url: dataUrl } },
						],
					}],
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				return left(new OpenAIAPIError(`OCR request failed: ${error}`));
			}

			const data: OpenAIChatResponse = await response.json();
			const text = data.choices[0]?.message?.content ?? "";

			return right(text);
		} catch (error) {
			return left(new OpenAIAPIError(`OCR failed: ${error}`));
		}
	}

	#toOpenAIMessage(message: ChatMessage): OpenAIMessage {
		const role = message.role === "model"
			? "assistant"
			: message.role === "tool"
			? "tool"
			: "user";

		// Handle tool responses
		if (message.role === "tool" && message.parts[0]?.toolResponse) {
			return {
				role: "tool",
				tool_call_id: message.parts[0].toolResponse.name,
				content: message.parts[0].toolResponse.text,
			};
		}

		// Handle text content
		const textParts = message.parts.filter((p) => p.text);
		if (textParts.length > 0) {
			return {
				role,
				content: textParts.map((p) => p.text).join("\n"),
			};
		}

		// Handle tool calls from assistant
		const toolCallParts = message.parts.filter((p) => p.toolCall);
		if (toolCallParts.length > 0 && role === "assistant") {
			return {
				role: "assistant",
				content: null,
				tool_calls: toolCallParts.map((p, i) => ({
					id: `call_${i}`,
					type: "function" as const,
					function: {
						name: p.toolCall!.name,
						arguments: JSON.stringify(p.toolCall!.args),
					},
				})),
			};
		}

		return { role, content: "" };
	}

	#extractMessage(response: OpenAIChatResponse): ChatMessage {
		const choice = response.choices[0];
		const msg: ChatMessage = { role: "model", parts: [] };

		if (choice.message.tool_calls?.length) {
			for (const toolCall of choice.message.tool_calls) {
				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(toolCall.function.arguments);
				} catch {
					// Ignore parse errors
				}
				msg.parts.push({
					toolCall: {
						name: toolCall.function.name,
						args,
					} as ToolCall,
				});
			}
		} else if (choice.message.content) {
			msg.parts.push({ text: choice.message.content });
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

	static #toOpenAITool(feature: Partial<FeatureData>): OpenAITool {
		const properties: Record<string, OpenAIPropertySchema> = {};
		const required: string[] = [];

		for (const param of feature.parameters ?? []) {
			properties[param.name] = OpenAIModel.#toPropertySchema(param);
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

	static #toPropertySchema(param: FeatureParameter): OpenAIPropertySchema {
		const schema: OpenAIPropertySchema = {
			type: OpenAIModel.#convertParameterType(param.type),
			description: param.description,
		};

		if (param.type === "array" && param.arrayType) {
			schema.items = { type: OpenAIModel.#convertParameterType(param.arrayType) };
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

export class OpenAIModelNotFoundError extends AntboxError {
	constructor(modelName: string) {
		super("OpenAIModelNotFound", `OpenAI model ${modelName} not found or not accessible`);
	}
}

export class OpenAIAPIError extends AntboxError {
	constructor(message: string) {
		super("OpenAIAPIError", `OpenAI API error: ${message}`);
	}
}

// ============================================================================
// MODEL LISTS & CAPABILITIES
// ============================================================================

const VALID_MODELS = [
	// GPT-4o models
	"gpt-4o",
	"gpt-4o-mini",
	"gpt-4o-2024-11-20",
	"gpt-4o-2024-08-06",
	// GPT-4 Turbo
	"gpt-4-turbo",
	"gpt-4-turbo-preview",
	// GPT-4
	"gpt-4",
	// GPT-3.5
	"gpt-3.5-turbo",
	// o1 reasoning models
	"o1",
	"o1-mini",
	"o1-preview",
	// Embedding models
	"text-embedding-3-small",
	"text-embedding-3-large",
	"text-embedding-ada-002",
];

const MODELS_WITH_TOOLS = [
	"gpt-4o",
	"gpt-4o-mini",
	"gpt-4o-2024-11-20",
	"gpt-4o-2024-08-06",
	"gpt-4-turbo",
	"gpt-4-turbo-preview",
	"gpt-4",
	"gpt-3.5-turbo",
];

const MODELS_WITH_REASONING = [
	"o1",
	"o1-mini",
	"o1-preview",
];

const MODELS_WITH_FILES = [
	"gpt-4o",
	"gpt-4o-mini",
	"gpt-4o-2024-11-20",
	"gpt-4o-2024-08-06",
	"gpt-4-turbo",
];

const MODELS_WITH_LLM = [
	"gpt-4o",
	"gpt-4o-mini",
	"gpt-4o-2024-11-20",
	"gpt-4o-2024-08-06",
	"gpt-4-turbo",
	"gpt-4-turbo-preview",
	"gpt-4",
	"gpt-3.5-turbo",
	"o1",
	"o1-mini",
	"o1-preview",
];

const MODELS_WITH_EMBEDDINGS = [
	"text-embedding-3-small",
	"text-embedding-3-large",
	"text-embedding-ada-002",
];

function isValidModel(modelName: string): boolean {
	return VALID_MODELS.includes(modelName);
}

function modelSupportsTools(modelName: string): boolean {
	return MODELS_WITH_TOOLS.includes(modelName);
}

function modelSupportsReasoning(modelName: string): boolean {
	return MODELS_WITH_REASONING.includes(modelName);
}

function modelSupportsFiles(modelName: string): boolean {
	return MODELS_WITH_FILES.includes(modelName);
}

function modelProvidesLLM(modelName: string): boolean {
	return MODELS_WITH_LLM.includes(modelName);
}

function modelProvidesEmbeddings(modelName: string): boolean {
	return MODELS_WITH_EMBEDDINGS.includes(modelName);
}
