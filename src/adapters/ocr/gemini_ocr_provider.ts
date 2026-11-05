import { left, right } from "shared/either.ts";
import type { Either } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { TokenUsage } from "domain/ai/chat_message.ts";
import type { OCRProvider, OCRResult } from "domain/ai/ocr_provider.ts";
import { type GenerateContentResponseUsageMetadata, GoogleGenAI } from "@google/genai";

/** Maps Gemini usage the way Pi does: thinking tokens are billed as output. */
export function geminiUsageToTokenUsage(
	metadata: GenerateContentResponseUsageMetadata | undefined,
): TokenUsage | undefined {
	if (!metadata) return undefined;
	const promptTokens = metadata.promptTokenCount ?? 0;
	const completionTokens = (metadata.candidatesTokenCount ?? 0) +
		(metadata.thoughtsTokenCount ?? 0);
	return {
		promptTokens,
		completionTokens,
		totalTokens: metadata.totalTokenCount ?? promptTokens + completionTokens,
	};
}

/**
 * GeminiOCRProvider - Uses Google Gemini multimodal models for OCR.
 *
 * @remarks
 * External setup:
 * - Set GOOGLE_API_KEY environment variable or pass apiKey parameter.
 * - Ensure the process can reach Google APIs.
 *
 * @example
 * const provider = new GeminiOCRProvider("gemini-flash-latest");
 */
export class GeminiOCRProvider implements OCRProvider {
	readonly #client: GoogleGenAI;
	readonly #modelName: string;

	constructor(modelName = "gemini-flash-latest", apiKey?: string) {
		const key = apiKey ?? Deno.env.get("GOOGLE_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
		if (!key) {
			Logger.error("GOOGLE_API_KEY nor GEMINI_API_KEY is set");
			Deno.exit(1);
		}
		this.#modelName = modelName;
		this.#client = new GoogleGenAI({ apiKey: key });
	}

	async ocr(file: File): Promise<Either<AntboxError, OCRResult>> {
		try {
			const base64Data = await this.#fileToBase64(file);

			const response = await this.#client.models.generateContent({
				model: this.#modelName,
				contents: [
					{
						role: "user",
						parts: [
							{
								text:
									"Extract all text content from this document or image. Return only the extracted text, preserving structure where possible.",
							},
							{
								inlineData: {
									mimeType: file.type,
									data: base64Data,
								},
							},
						],
					},
				],
			});

			return right({
				text: response.text ?? "",
				usage: geminiUsageToTokenUsage(response.usageMetadata),
			});
		} catch (error) {
			return left(
				new AntboxError(
					"GeminiOCRError",
					`OCR failed for file ${file.name}: ${error}`,
				),
			);
		}
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
}

/**
 * Factory function for loading GeminiOCRProvider from configuration
 */
export default function buildGeminiOCRProvider(
	modelName?: string,
	apiKey?: string,
): Promise<Either<AntboxError, GeminiOCRProvider>> {
	return Promise.resolve(
		right(new GeminiOCRProvider(modelName ?? "gemini-flash-latest", apiKey)),
	);
}
