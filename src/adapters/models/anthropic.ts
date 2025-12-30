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

interface AnthropicMessage {
	role: "user" | "assistant";
	content: AnthropicContent[] | string;
}

type AnthropicContent =
	| { type: "text"; text: string }
	| { type: "image"; source: { type: "base64"; media_type: string; data: string } }
	| { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
	| { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicTool {
	name: string;
	description: string;
	input_schema: {
		type: "object";
		properties: Record<string, AnthropicPropertySchema>;
		required?: string[];
	};
}

interface AnthropicPropertySchema {
	type: string;
	description?: string;
	items?: { type: string };
}

interface AnthropicResponse {
	id: string;
	type: string;
	role: string;
	content: AnthropicContent[];
	model: string;
	stop_reason: string;
	stop_sequence: string | null;
	usage: {
		input_tokens: number;
		output_tokens: number;
	};
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Builds an Anthropic AIModel instance.
 *
 * @remarks
 * External setup:
 * - Create an Anthropic API key and set `ANTHROPIC_API_KEY` (or pass `apiKey`).
 * - Ensure the process can reach `https://api.anthropic.com` (`--allow-net` in Deno).
 *
 * @param modelName The name of the Anthropic model (e.g., "claude-sonnet-4-20250514").
 * @param apiKey Optional API key (defaults to `ANTHROPIC_API_KEY`).
 *
 * @example
 * const modelOrErr = buildAnthropicModel("claude-3-5-haiku-20241022");
 * if (modelOrErr.isRight()) {
 *   const model = modelOrErr.value;
 * }
 */
export default function buildAnthropicModel(
	modelName: string,
	apiKey?: string,
): Either<AntboxError, AIModel> {
	const key = apiKey ?? Deno.env.get("ANTHROPIC_API_KEY");

	if (!key) {
		Logger.error(
			"FATAL: Anthropic API key not provided and ANTHROPIC_API_KEY environment variable not set",
		);
		Deno.exit(1);
	}

	const model = new AnthropicModel(modelName, key);

	const validation = model.validateModel();
	if (validation.isLeft()) {
		return left(validation.value);
	}

	return right(model);
}

// ============================================================================
// ANTHROPIC MODEL CLASS
// ============================================================================

export class AnthropicModel implements AIModel {
	readonly modelName: string;
	embeddings: boolean = false;
	llm: boolean = false;
	tools: boolean = false;
	files: boolean = false;
	reasoning: boolean = false;

	readonly #apiKey: string;
	readonly #baseUrl = "https://api.anthropic.com/v1";
	readonly #apiVersion = "2023-06-01";

	constructor(name: string, apiKey: string) {
		this.modelName = name;
		this.#apiKey = apiKey;
	}

	validateModel(): Either<AntboxError, void> {
		if (!isValidModel(this.modelName)) {
			return left(new AnthropicModelNotFoundError(this.modelName));
		}

		this.embeddings = false; // Anthropic does not provide embeddings
		this.llm = modelProvidesLLM(this.modelName);
		this.tools = modelSupportsTools(this.modelName);
		this.files = modelSupportsFiles(this.modelName);
		this.reasoning = modelSupportsReasoning(this.modelName);

		return right(undefined);
	}

	async embed(_texts: string[]): Promise<Either<AntboxError, Embedding[]>> {
		return left(new AnthropicAPIError("Anthropic does not support embeddings"));
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
			return left(new AnthropicAPIError("Model does not support LLM"));
		}

		try {
			const messages: AnthropicMessage[] = [];

			if (options?.history?.length) {
				messages.push(...options.history.map((m) => this.#toAnthropicMessage(m)));
			}

			if (typeof input === "string") {
				messages.push({ role: "user", content: input });
			} else {
				messages.push(this.#toAnthropicMessage(input));
			}

			const requestBody: Record<string, unknown> = {
				model: this.modelName,
				messages,
				max_tokens: options?.maxTokens ?? 4096,
			};

			if (options?.systemPrompt) {
				requestBody.system = options.systemPrompt;
			}

			if (options?.temperature !== undefined) {
				requestBody.temperature = options.temperature;
			}

			if (options?.tools?.length && this.tools) {
				requestBody.tools = options.tools.map(AnthropicModel.#toAnthropicTool);
			}

			const response = await fetch(`${this.#baseUrl}/messages`, {
				method: "POST",
				headers: {
					"x-api-key": this.#apiKey,
					"anthropic-version": this.#apiVersion,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const error = await response.text();
				return left(new AnthropicAPIError(`Chat request failed: ${error}`));
			}

			const data: AnthropicResponse = await response.json();
			const msg = this.#extractMessage(data);

			return right(msg);
		} catch (error) {
			return left(new AnthropicAPIError(`Chat failed: ${error}`));
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
			return left(new AnthropicAPIError("Model does not support file inputs"));
		}

		try {
			const base64Data = await this.#fileToBase64(file);

			const response = await fetch(`${this.#baseUrl}/messages`, {
				method: "POST",
				headers: {
					"x-api-key": this.#apiKey,
					"anthropic-version": this.#apiVersion,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.modelName,
					max_tokens: 4096,
					messages: [{
						role: "user",
						content: [
							{
								type: "image",
								source: {
									type: "base64",
									media_type: file.type,
									data: base64Data,
								},
							},
							{
								type: "text",
								text: "Extract all text from this image/document.",
							},
						],
					}],
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				return left(new AnthropicAPIError(`OCR request failed: ${error}`));
			}

			const data: AnthropicResponse = await response.json();
			const textContent = data.content.find((c) => c.type === "text");
			const text = textContent && "text" in textContent ? textContent.text : "";

			return right(text);
		} catch (error) {
			return left(new AnthropicAPIError(`OCR failed: ${error}`));
		}
	}

	#toAnthropicMessage(message: ChatMessage): AnthropicMessage {
		const role = message.role === "model" ? "assistant" : "user";
		const content: AnthropicContent[] = [];

		for (const part of message.parts) {
			if (part.text) {
				content.push({ type: "text", text: part.text });
			} else if (part.toolCall) {
				content.push({
					type: "tool_use",
					id: `tool_${part.toolCall.name}`,
					name: part.toolCall.name,
					input: part.toolCall.args,
				});
			} else if (part.toolResponse) {
				content.push({
					type: "tool_result",
					tool_use_id: `tool_${part.toolResponse.name}`,
					content: part.toolResponse.text,
				});
			}
		}

		return { role, content };
	}

	#extractMessage(response: AnthropicResponse): ChatMessage {
		const msg: ChatMessage = { role: "model", parts: [] };

		for (const content of response.content) {
			if (content.type === "text") {
				msg.parts.push({ text: content.text });
			} else if (content.type === "tool_use") {
				msg.parts.push({
					toolCall: {
						name: content.name,
						args: content.input,
					} as ToolCall,
				});
			}
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

	static #toAnthropicTool(feature: Partial<FeatureData>): AnthropicTool {
		const properties: Record<string, AnthropicPropertySchema> = {};
		const required: string[] = [];

		for (const param of feature.parameters ?? []) {
			properties[param.name] = AnthropicModel.#toPropertySchema(param);
			if (param.required) {
				required.push(param.name);
			}
		}

		return {
			name: feature.uuid!,
			description: feature.description || "",
			input_schema: {
				type: "object",
				properties,
				required: required.length > 0 ? required : undefined,
			},
		};
	}

	static #toPropertySchema(param: FeatureParameter): AnthropicPropertySchema {
		const schema: AnthropicPropertySchema = {
			type: AnthropicModel.#convertParameterType(param.type),
			description: param.description,
		};

		if (param.type === "array" && param.arrayType) {
			schema.items = { type: AnthropicModel.#convertParameterType(param.arrayType) };
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

export class AnthropicModelNotFoundError extends AntboxError {
	constructor(modelName: string) {
		super("AnthropicModelNotFound", `Anthropic model ${modelName} not found or not accessible`);
	}
}

export class AnthropicAPIError extends AntboxError {
	constructor(message: string) {
		super("AnthropicAPIError", `Anthropic API error: ${message}`);
	}
}

// ============================================================================
// MODEL LISTS & CAPABILITIES
// ============================================================================

const VALID_MODELS = [
	// Claude 4 models
	"claude-sonnet-4-20250514",
	// Claude 3.5 models
	"claude-3-5-sonnet-20241022",
	"claude-3-5-haiku-20241022",
	// Claude 3 models
	"claude-3-opus-20240229",
	"claude-3-sonnet-20240229",
	"claude-3-haiku-20240307",
];

const MODELS_WITH_TOOLS = [
	"claude-sonnet-4-20250514",
	"claude-3-5-sonnet-20241022",
	"claude-3-5-haiku-20241022",
	"claude-3-opus-20240229",
	"claude-3-sonnet-20240229",
	"claude-3-haiku-20240307",
];

const MODELS_WITH_REASONING = [
	"claude-sonnet-4-20250514",
	"claude-3-5-sonnet-20241022",
	"claude-3-opus-20240229",
];

const MODELS_WITH_FILES = [
	"claude-sonnet-4-20250514",
	"claude-3-5-sonnet-20241022",
	"claude-3-5-haiku-20241022",
	"claude-3-opus-20240229",
	"claude-3-sonnet-20240229",
	"claude-3-haiku-20240307",
];

const MODELS_WITH_LLM = [
	"claude-sonnet-4-20250514",
	"claude-3-5-sonnet-20241022",
	"claude-3-5-haiku-20241022",
	"claude-3-opus-20240229",
	"claude-3-sonnet-20240229",
	"claude-3-haiku-20240307",
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
