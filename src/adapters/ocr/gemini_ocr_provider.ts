import { left, right } from "shared/either.ts";
import type { Either } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { OCRProvider } from "domain/ai/ocr_provider.ts";
import { GoogleGenAI } from "@google/genai";

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
    const key = apiKey ?? Deno.env.get("GOOGLE_API_KEY");
    if (!key) {
      Logger.error("GOOGLE_API_KEY is not set");
      Deno.exit(1);
    }
    this.#modelName = modelName;
    this.#client = new GoogleGenAI({ apiKey: key });
  }

  async ocr(file: File): Promise<Either<AntboxError, string>> {
    try {
      const base64Data = await this.#fileToBase64(file);

      const response = await this.#client.models.generateContent({
        model: this.#modelName,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Extract all text content from this document or image. Return only the extracted text, preserving structure where possible.",
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

      return right(response.text ?? "");
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
