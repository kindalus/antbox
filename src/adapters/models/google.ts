import { Either, left, right } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import type { AIModel, Embedding } from "application/ai_model.ts";
import { ChatHistory, ChatMessage, ToolCall } from "domain/ai/chat_message.ts";
import { FeatureDTO } from "application/feature_dto.ts";
import { FeatureParameter } from "domain/features/feature_node.ts";
import { GoogleGenAI } from "@google/genai";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface GoogleFunction {
	name: string;
	description: string;
	parameters: GoogleParameterSchema;
}

interface GoogleParameterSchema {
	type: "object";
	properties: Record<string, GoogleParameterType>;
	required?: string[];
}

interface GoogleParameterType {
	type: string;
	description?: string;
	items?: { type: string };
}

interface GoogleContent {
	role: string;
	parts: GooglePart[];
}

interface GooglePart {
	text?: string;
	functionCall?: {
		name: string;
		args: Record<string, unknown>;
	};
	inlineData?: {
		mimeType: string;
		data: string;
	};
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class GoogleAPIKeyMissingError extends AntboxError {
	constructor() {
		super(
			"GoogleAPIKeyMissing",
			"Google API key not provided and GEMINI_API_KEY environment variable not set",
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

/**
 * Convert Antbox FeatureDTO array to Google function declarations
 */
function convertToGoogleFunctions(features: Partial<FeatureDTO>[]): GoogleFunction[] {
	return features.map((feature) => ({
		name: feature.name!,
		description: feature.description || "",
		parameters: convertParameters(feature.parameters || []),
	}));
}

/**
 * Convert FeatureParameters to Google parameter schema
 */
function convertParameters(params: FeatureParameter[]): GoogleParameterSchema {
	const properties: Record<string, GoogleParameterType> = {};
	const required: string[] = [];

	for (const param of params) {
		properties[param.name] = convertParameterType(param);

		if (param.required) {
			required.push(param.name);
		}
	}

	return {
		type: "object",
		properties,
		required: required.length > 0 ? required : undefined,
	};
}

/**
 * Convert a single FeatureParameter to Google parameter type
 */
function convertParameterType(param: FeatureParameter): GoogleParameterType {
	const typeMap: Record<string, string> = {
		string: "string",
		number: "number",
		boolean: "boolean",
		object: "object",
	};

	if (param.type === "array") {
		return {
			type: "array",
			description: param.description,
			items: { type: typeMap[param.arrayType || "string"] || "string" },
		};
	}

	return {
		type: typeMap[param.type] || "string",
		description: param.description,
	};
}

// ============================================================================
// MODEL LISTS & CAPABILITIES
// ============================================================================

/**
 * List of valid Google models that can be used
 */
const VALID_MODELS = [
	// Gemini 2.X models (LLM with tools, files, reasoning)
	"gemini-2.0-flash",
	"gemini-2.5-flash",
	"gemini-2.5-flash-lite",
	"gemini-2.0-pro",
	"gemini-2.5-pro",

	// Embedding models
	"text-embedding-004",
	"text-embedding-preview-0815",
	"embedding-001",
];

/**
 * Models that support tools/function calling
 */
const MODELS_WITH_TOOLS = [
	"gemini-2.0-flash",
	"gemini-2.5-flash",
	"gemini-2.5-flash-lite",
	"gemini-2.0-pro",
	"gemini-2.5-pro",
];

/**
 * Models that support reasoning/thinking mode
 */
const MODELS_WITH_REASONING = [
	"gemini-2.0-flash",
	"gemini-2.5-flash",
	"gemini-2.5-flash-lite",
	"gemini-2.0-pro",
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
	"gemini-2.0-flash",
	"gemini-2.5-flash",
	"gemini-2.5-flash-lite",
	"gemini-2.0-pro",
	"gemini-2.5-pro",
];

/**
 * Models that provide embeddings
 */
const MODELS_WITH_EMBEDDINGS = [
	"text-embedding-004",
	"text-embedding-preview-0815",
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract function calls from Google model response
 */
function extractFunctionCalls(
	googleResponse: any,
): ToolCall[] {
	const calls: Array<{ name: string; args: Record<string, unknown> }> = [];

	if (googleResponse.candidates && googleResponse.candidates.length > 0) {
		const candidate = googleResponse.candidates[0];
		if (candidate.content && candidate.content.parts) {
			for (const part of candidate.content.parts) {
				if (part.functionCall) {
					calls.push({
						name: part.functionCall.name,
						args: part.functionCall.args || {},
					});
				}
			}
		}
	}

	return calls;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Factory function to build a Google AI Model
 * @param modelName The name of the Google model (e.g., "gemini-2.0-flash-exp")
 * @param apiKey Optional API key (if not provided, uses GEMINI_API_KEY env var)
 * @throws Exits process if no API key is available (panic behavior)
 */
export default function buildGoogleModel(
	modelName: string,
	apiKey?: string,
): Either<AntboxError, AIModel> {
	const key = apiKey ?? Deno.env.get("GEMINI_API_KEY");

	if (!key) {
		console.error(
			"FATAL: Google API key not provided and GEMINI_API_KEY environment variable not set",
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
	readonly name: string;
	embeddings: boolean = false;
	llm: boolean = false;
	tools: boolean = false;
	files: boolean = false;
	reasoning: boolean = false;

	private readonly apiKey: string;
	private readonly client: GoogleGenAI;

	constructor(
		name: string,
		apiKey: string,
	) {
		this.name = name;
		this.apiKey = apiKey;
		this.client = new GoogleGenAI({ apiKey });
	}

	/**
	 * Validate model exists and determine capabilities
	 */
	validateModel(): Either<AntboxError, void> {
		// Check if model is in the valid models list
		if (!isValidModel(this.name)) {
			return left(new GoogleModelNotFoundError(this.name));
		}

		// Set capabilities based on model lists
		this.embeddings = modelProvidesEmbeddings(this.name);
		this.llm = modelProvidesLLM(this.name);
		this.tools = modelSupportsTools(this.name);
		this.files = modelSupportsFiles(this.name);
		this.reasoning = modelSupportsReasoning(this.name);

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
					model: this.name,
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
		if (!this.llm) {
			return left(new GoogleAPIError("Model does not support LLM"));
		}

		try {
			// Build components
			const generationConfig = this.#buildGenerationConfig(options);
			const systemInstruction = this.#buildSystemInstruction(options?.systemPrompt);
			const tools = this.#buildToolsConfig(options?.tools);
			const userParts = await this.#buildContentParts(text, options?.files);

			// Convert history to Google format
			const history = options?.history || [];
			const googleHistory = this.convertHistoryToGoogle(history);

			// Create chat configuration
			const chatConfig: any = {
				model: this.name,
				config: {
					generationConfig,
				},
			};

			if (systemInstruction) {
				chatConfig.config.systemInstruction = systemInstruction;
			}

			if (tools) {
				chatConfig.config.tools = tools;
			}

			// Add history if exists
			if (googleHistory.length > 0) {
				chatConfig.history = googleHistory;
			}

			// Create chat session
			const chat = this.client.chats.create(chatConfig);

			// Send message
			const response = await chat.sendMessage({
				message: userParts,
			});

			const parts = this.#buildResponseParts(response);

			return right({
				role: "model" as const,
				parts,
			});
		} catch (error) {
			return left(new GoogleAPIError(`Chat failed: ${error}`));
		}
	}

	/**
	 * Build generation config from options
	 */
	#buildGenerationConfig(options?: {
		temperature?: number;
		maxTokens?: number;
		structuredOutput?: string;
	}): Record<string, unknown> {
		const generationConfig: Record<string, unknown> = {};

		if (options?.temperature !== undefined) {
			generationConfig.temperature = options.temperature;
		}
		if (options?.maxTokens !== undefined) {
			generationConfig.maxOutputTokens = options.maxTokens;
		}
		if (options?.structuredOutput) {
			try {
				generationConfig.responseMimeType = "application/json";
				generationConfig.responseSchema = JSON.parse(options.structuredOutput);
			} catch {
				// Ignore malformed schema
			}
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

	/**
	 * Build tools configuration from feature DTOs
	 */
	#buildToolsConfig(
		tools?: Partial<FeatureDTO>[],
	): Array<{ functionDeclarations: GoogleFunction[] }> | undefined {
		if (!tools || tools.length === 0 || !this.tools) {
			return undefined;
		}
		return [{
			functionDeclarations: convertToGoogleFunctions(tools),
		}];
	}

	/**
	 * Build content parts with text and files
	 */
	async #buildContentParts(text: string, files?: File[]): Promise<GooglePart[]> {
		const contentParts: GooglePart[] = [{ text }];

		if (files && this.files) {
			for (const file of files) {
				const base64Data = await this.#fileToBase64(file);
				contentParts.push({
					inlineData: {
						mimeType: file.type,
						data: base64Data,
					},
				});
			}
		}

		return contentParts;
	}

	/**
	 * Build response parts from Google API response
	 */
	#buildResponseParts(response: any): Array<{ text?: string; toolCall?: ToolCall }> {
		const responseText = this.extractTextFromResponse(response);
		const toolCalls = extractFunctionCalls(response as any);
		const parts: Array<{ text?: string; toolCall?: ToolCall }> = [];

		if (responseText) {
			parts.push({ text: responseText });
		}

		if (toolCalls.length > 0) {
			parts.push(...toolCalls.map((toolCall) => ({ toolCall })));
		}

		return parts;
	}

	/**
	 * One-shot question answering
	 */
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
		if (!this.llm) {
			return left(new GoogleAPIError("Model does not support LLM"));
		}

		try {
			// Build components
			const generationConfig = this.#buildGenerationConfig(options);
			const systemInstruction = this.#buildSystemInstruction(options?.systemPrompt);
			const tools = this.#buildToolsConfig(options?.tools);
			const contentParts = await this.#buildContentParts(text, options?.files);

			// Build request
			const request: any = {
				model: this.name,
				contents: [{
					role: "user",
					parts: contentParts,
				}],
				generationConfig,
			};

			if (systemInstruction) {
				request.systemInstruction = systemInstruction;
			}

			if (tools) {
				request.tools = tools;
			}

			// Generate content
			const response = await this.client.models.generateContent(request);

			const parts = this.#buildResponseParts(response);

			return right({
				role: "model" as const,
				parts,
			});
		} catch (error) {
			return left(new GoogleAPIError(`Answer failed: ${error}`));
		}
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
				model: this.name,
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

			return right(this.extractTextFromResponse(response));
		} catch (error) {
			return left(new GoogleAPIError(`OCR failed: ${error}`));
		}
	}

	/**
	 * Convert chat history to Google format
	 */
	private convertHistoryToGoogle(history: ChatHistory): GoogleContent[] {
		return history
			.filter((message) => message.parts.some((part) => part.text))
			.map((message) => ({
				role: message.role === "model" ? "model" : "user",
				parts: message.parts
					.filter((part) => part.text)
					.map((part) => ({ text: part.text! })),
			}));
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	/**
	 * Extract text from Google response
	 */
	private extractTextFromResponse(response: any): string {
		if (typeof response.text === "function") {
			return response.text() || "";
		}

		if (typeof response.text === "string") {
			return response.text;
		}

		if (response.candidates && response.candidates.length > 0) {
			const candidate = response.candidates[0];

			if (candidate.content?.parts) {
				return candidate.content.parts
					.filter((part: any) => part.text)
					.map((part: any) => part.text)
					.join("");
			}
		}

		return "";
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
}
