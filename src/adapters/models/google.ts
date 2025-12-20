import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { AIModel, Embedding } from "application/ai_model.ts";
import { ChatHistory, ChatMessage, ToolCall, ToolResponse } from "domain/ai/chat_message.ts";
import { FeatureDTO } from "application/feature_dto.ts";
import {
	FeatureParameter,
	FeatureParameterArrayType,
	FeatureParameterType,
} from "domain/features/feature_node.ts";
import {
	Content,
	FunctionDeclaration,
	GenerateContentConfig,
	GenerateContentResponse,
	GoogleGenAI,
	Part,
	Schema,
	Type,
} from "@google/genai";

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Factory function to build a Google AI Model
 * @param modelName The name of the Google model (e.g., "gemini-2.0-flash-exp")
 * @param apiKey Optional API key (if not provided, uses GOOGLE_API_KEY env var)
 * @throws Exits process if no API key is available (panic behavior)
 */
export default function buildGoogleModel(
	modelName: string,
	apiKey?: string,
): Either<AntboxError, AIModel> {
	const key = apiKey ?? Deno.env.get("GOOGLE_API_KEY");

	if (!key) {
		console.error(
			"FATAL: Google API key not provided and GOOGLE_API_KEY environment variable not set",
		);
		Deno.exit(1);
	}

	const model = new GoogleModel(modelName, key);

	// Validate model exists and determine capabilities
	const validation = model.validateModel();
	if (validation.isLeft()) {
		return left(validation.value);
	}

	return right(model);
}

// ============================================================================
// GOOGLE MODEL CLASS
// ============================================================================

/**
 * Google AI Model implementation supporting Gemini models
 * Supports both embedding and LLM capabilities depending on model type
 */
export class GoogleModel implements AIModel {
	readonly modelName: string;
	embeddings: boolean = false;
	llm: boolean = false;
	tools: boolean = false;
	files: boolean = false;
	reasoning: boolean = false;

	private readonly client: GoogleGenAI;

	constructor(name: string, apiKey: string) {
		this.modelName = name;
		this.client = new GoogleGenAI({ apiKey });
	}

	/**
	 * Validate model exists and determine capabilities
	 */
	validateModel(): Either<AntboxError, void> {
		// Check if model is in the valid models list
		if (!isValidModel(this.modelName)) {
			return left(new GoogleModelNotFoundError(this.modelName));
		}

		// Set capabilities based on model lists
		this.embeddings = modelProvidesEmbeddings(this.modelName);
		this.llm = modelProvidesLLM(this.modelName);
		this.tools = modelSupportsTools(this.modelName);
		this.files = modelSupportsFiles(this.modelName);
		this.reasoning = modelSupportsReasoning(this.modelName);

		return right(undefined);
	}

	/**
	 * Generate embeddings for multiple texts
	 */
	async embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>> {
		if (!this.embeddings) {
			return left(new GoogleAPIError("Model does not support embeddings"));
		}

		try {
			const embeddings: Embedding[] = [];

			// Process each text individually for embedding models
			for (const text of texts) {
				const response = await this.client.models.embedContent({
					model: this.modelName,
					contents: {
						parts: [{ text }],
					},
				});

				if (response.embeddings && response.embeddings[0]?.values) {
					embeddings.push(response.embeddings[0].values);
				} else {
					return left(
						new GoogleAPIError(
							`No embedding values returned for text: ${text.substring(0, 50)}...`,
						),
					);
				}
			}

			return right(embeddings);
		} catch (error) {
			return left(
				new GoogleAPIError(`Failed to generate embeddings: ${error}`),
			);
		}
	}

	/**
	 * Interactive chat with history and tool support
	 */
	async chat(
		input: string | ChatMessage,
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
		if (!this.llm) {
			return left(new GoogleAPIError("Model does not support LLM"));
		}

		if (typeof input === "string") {
			input = { role: "user", parts: [{ text: input }] } as ChatMessage;
		}

		try {
			// Build components
			const config = options ? this.#buildGenerateContentConfig(options) : {};
			const contents: Content[] = [];

			if (options?.history?.length) {
				contents.push(...options.history.map((m) => this.#toGoogleContent(m)));
			}

			contents.push(this.#toGoogleContent(input));

			// Create chat session
			const response = await this.client.models.generateContent({
				model: this.modelName,
				contents,
				config,
			});

			const msg = this.#extractMessage(response);

			return right(msg);
		} catch (error) {
			return left(new GoogleAPIError(`Chat failed: ${error}`));
		}
	}

	/**
	 * Build generation config from options
	 */
	#buildGenerateContentConfig(options: {
		systemPrompt?: string;
		history?: ChatHistory;
		tools?: Partial<FeatureDTO>[];
		files?: File[];
		temperature?: number;
		maxTokens?: number;
		reasoning?: boolean;
		structuredOutput?: string;
	}): GenerateContentConfig {
		const generationConfig: Partial<GenerateContentConfig> = {
			systemInstruction: this.#buildSystemInstruction(options.systemPrompt ?? ""),
		};

		if (options.temperature !== undefined) {
			generationConfig.temperature = options.temperature;
		}

		if (options.maxTokens !== undefined) {
			generationConfig.maxOutputTokens = options.maxTokens;
		}

		if (options.structuredOutput) {
			try {
				generationConfig.responseMimeType = "application/json";
				generationConfig.responseSchema = JSON.parse(options.structuredOutput);
			} catch {
				// Ignore malformed schema
			}
		}
		if (options.tools && options.tools.length) {
			generationConfig.tools = [{
				functionDeclarations: options.tools.map(GoogleModel.#toFunctionDeclaration),
			}];
		}

		return generationConfig;
	}

	/**
	 * Build system instruction from system prompt
	 */
	#buildSystemInstruction(
		systemPrompt?: string,
	): { parts: Array<{ text: string }> } | undefined {
		if (!systemPrompt) {
			return undefined;
		}
		return {
			parts: [{ text: systemPrompt }],
		};
	}

	//TODO: Implement files

	// /**
	//  * Build content parts with text and files
	//  */
	// async #buildContentParts(text: string, files?: File[]): Promise<GooglePart[]> {
	// 	const contentParts: GooglePart[] = [{ text }];

	// 	if (files && this.files) {
	// 		for (const file of files) {
	// 			const base64Data = await this.#fileToBase64(file);
	// 			contentParts.push({
	// 				inlineData: {
	// 					mimeType: file.type,
	// 					data: base64Data,
	// 				},
	// 			});
	// 		}
	// 	}

	// 	return contentParts;
	// }

	/**
	 * One-shot question answering
	 */
	async answer(
		input: string | ChatMessage,
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
		const result = await this.chat(input, options);

		if (result.isLeft()) {
			return left(new GoogleAPIError(`Answer failed: ${result.value.cause}`));
		}

		return result;
	}

	/**
	 * Perform OCR on a file
	 */
	async ocr(file: File): Promise<Either<AntboxError, string>> {
		if (!this.files) {
			return left(new GoogleAPIError("Model does not support file inputs"));
		}

		try {
			const base64Data = await this.#fileToBase64(file);

			const response = await this.client.models.generateContent({
				model: this.modelName,
				contents: [{
					role: "user",
					parts: [
						{ text: "Extract all text from this image/document." },
						{
							inlineData: {
								mimeType: file.type,
								data: base64Data,
							},
						},
					],
				}],
			});

			return right(response.text!);
		} catch (error) {
			return left(new GoogleAPIError(`OCR failed: ${error}`));
		}
	}

	/**
	 * Convert chat history to Google format
	 */
	#toGoogleContent(message: ChatMessage): Content {
		return {
			role: message.role === "model" ? "model" : "user",
			parts: message.parts.map((part) => this.#toGooglePart(part)),
		};
	}

	#toGooglePart(
		part: { text?: string; toolCall?: ToolCall; toolResponse?: ToolResponse },
	): Part {
		if (part.text) {
			return { text: part.text };
		}

		if (part.toolCall) {
			return {
				functionCall: {
					name: part.toolCall.name,
					args: part.toolCall.args,
				},
			};
		}

		if (part.toolResponse) {
			return {
				functionResponse: {
					name: part.toolResponse.name,
					response: part.toolResponse as unknown as Record<string, unknown>,
				},
			};
		}

		return { text: "ND" };
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	/**
	 * Extract function calls from Google model response
	 */
	#extractMessage(
		res: GenerateContentResponse,
	): ChatMessage {
		const msg: ChatMessage = { role: "model", parts: [] };

		if (!res.functionCalls) {
			msg.parts.push({ text: res.text });
			return msg;
		}

		const calls = res.functionCalls.map(
			(c) => ({ toolCall: { name: c.name, args: c.args || {} } as ToolCall }),
		);

		msg.parts.push(...calls);
		return msg;
	}

	/**
	 * Convert file to base64 string
	 */
	async #fileToBase64(file: File): Promise<string> {
		const arrayBuffer = await file.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);
		let binary = "";
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	/**
	 * Convert Antbox FeatureDTO array to Google function declarations
	 */
	static #toFunctionDeclaration(feature: Partial<FeatureDTO>): FunctionDeclaration {
		const parameters: Schema = {
			type: Type.OBJECT,
		};

		parameters.properties = feature.parameters
			?.map(GoogleModel.#toPropertySchema)
			.reduce((acc, cur) => {
				acc[cur[0]] = cur[1];
				return acc;
			}, {} as Record<string, Schema>);

		parameters.required = feature.parameters
			?.filter((param) => param.required)
			.map((param) => param.name);

		return {
			name: feature.name!,
			description: feature.description || "",
			parameters,
		};
	}

	/**
	 * Convert FeatureParameters to Google parameter schema
	 */
	static #toPropertySchema(param: FeatureParameter): [string, Schema] {
		const s: Schema = {
			type: GoogleModel.#convertParameterType(param.type),
			description: param.description,
		};

		if (param.type === "array") {
			s.items = { type: GoogleModel.#convertArrayParameterType(param.arrayType!) };
		}

		return [param.name, s];
	}

	/**
	 * Convert a single FeatureParameter to Google parameter type
	 */
	static #convertParameterType(
		type: FeatureParameterType,
	): Type {
		switch (type) {
			case "string":
				return Type.STRING;

			case "number":
				return Type.NUMBER;

			case "boolean":
				return Type.BOOLEAN;

			case "array":
				return Type.ARRAY;
		}

		return Type.OBJECT;
	}

	static #convertArrayParameterType(type: FeatureParameterArrayType): Type {
		switch (type) {
			case "string":
				return Type.STRING;

			case "number":
				return Type.NUMBER;
		}

		return Type.OBJECT;
	}
}
// ============================================================================
// ERROR CLASSES
// ============================================================================

export class GoogleAPIKeyMissingError extends AntboxError {
	constructor() {
		super(
			"GoogleAPIKeyMissing",
			"Google API key not provided and GOOGLE_API_KEY environment variable not set",
		);
	}
}

export class GoogleModelNotFoundError extends AntboxError {
	constructor(modelName: string) {
		super(
			"GoogleModelNotFound",
			`Google model ${modelName} not found or not accessible`,
		);
	}
}

export class GoogleAPIError extends AntboxError {
	constructor(message: string) {
		super("GoogleAPIError", `Google API error: ${message}`);
	}
}

// ============================================================================
// TOOL CONVERTER UTILITIES
// ============================================================================

// ============================================================================
// MODEL LISTS & CAPABILITIES
// ============================================================================

/**
 * List of valid Google models that can be used
 */
const VALID_MODELS = [
	// Gemini 2.X models (LLM with tools, files, reasoning)
	"gemini-2.5-flash",
	"gemini-2.5-pro",
	"gemma-3-12b-it",
	// Embedding models
	"text-embedding-004",
	"text-embedding-0815",
	"embedding-001",
];

/**
 * Models that support tools/function calling
 */
const MODELS_WITH_TOOLS = [
	"gemini-2.5-flash",
	"gemini-2.5-pro",
	"gemma-3-12b-it",
];

/**
 * Models that support reasoning/thinking mode
 */
const MODELS_WITH_REASONING = [
	"gemini-2.5-flash",
	"gemini-2.5-pro",
];

/**
 * Models that support file inputs (multimodal)
 */
const MODELS_WITH_FILES = [
	"gemini-2.0-flash",
	"gemini-2.5-flash",
	"gemini-2.5-flash-lite",
	"gemini-2.0-pro",
	"gemini-2.5-pro",
];

/**
 * Models that provide LLM capabilities
 */
const MODELS_WITH_LLM = [
	"gemini-2.5-flash",
	"gemini-2.5-pro",
	"gemma-3-12b-it",
];

/**
 * Models that provide embeddings
 */
const MODELS_WITH_EMBEDDINGS = [
	"text-embedding-004",
	"text-embedding-0815",
	"embedding-001",
];

/**
 * Check if a model is valid
 */
function isValidModel(modelName: string): boolean {
	return VALID_MODELS.includes(modelName);
}

/**
 * Check if a model supports tools
 */
function modelSupportsTools(modelName: string): boolean {
	return MODELS_WITH_TOOLS.includes(modelName);
}

/**
 * Check if a model supports reasoning
 */
function modelSupportsReasoning(modelName: string): boolean {
	return MODELS_WITH_REASONING.includes(modelName);
}

/**
 * Check if a model supports files
 */
function modelSupportsFiles(modelName: string): boolean {
	return MODELS_WITH_FILES.includes(modelName);
}

/**
 * Check if a model provides LLM capabilities
 */
function modelProvidesLLM(modelName: string): boolean {
	return MODELS_WITH_LLM.includes(modelName);
}

/**
 * Check if a model provides embeddings
 */
function modelProvidesEmbeddings(modelName: string): boolean {
	return MODELS_WITH_EMBEDDINGS.includes(modelName);
}
