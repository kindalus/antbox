import { left, right } from "shared/either.ts";
import type { Either } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type { Embedding, EmbeddingsProvider } from "domain/ai/embeddings_provider.ts";
import { GoogleGenAI } from "@google/genai";

/**
 * GeminiEmbeddingsProvider - Uses Google text-embedding models.
 *
 * @remarks
 * External setup:
 * - Set GOOGLE_API_KEY environment variable or pass apiKey parameter.
 * - Ensure the process can reach Google APIs.
 *
 * @example
 * const provider = new GeminiEmbeddingsProvider("text-embedding-004");
 */
export class GeminiEmbeddingsProvider implements EmbeddingsProvider {
	readonly #client: GoogleGenAI;
	readonly #modelName: string;
	readonly #threshold: number;

	constructor(modelName = "text-embedding-004", apiKey?: string, threshold = 0.5) {
		const key = apiKey ?? Deno.env.get("GOOGLE_API_KEY");
		if (!key) {
			Logger.error("GOOGLE_API_KEY is not set");
			Deno.exit(1);
		}
		this.#modelName = modelName;
		this.#threshold = Math.max(0, Math.min(1, threshold));
		this.#client = new GoogleGenAI({ apiKey: key });
	}

	async embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>> {
		try {
			const embeddings: Embedding[] = [];

			for (const text of texts) {
				const response = await this.#client.models.embedContent({
					model: this.#modelName,
					contents: { parts: [{ text }] },
				});

				if (response.embeddings && response.embeddings[0]?.values) {
					embeddings.push(response.embeddings[0].values);
				} else {
					return left(
						new AntboxError(
							"GeminiEmbeddingsError",
							`No embedding values returned for text: ${text.substring(0, 50)}...`,
						),
					);
				}
			}

			return right(embeddings);
		} catch (error) {
			return left(
				new AntboxError("GeminiEmbeddingsError", `Failed to generate embeddings: ${error}`),
			);
		}
	}

	relevanceThreshold(): number {
		return this.#threshold;
	}
}

/**
 * Factory function for loading GeminiEmbeddingsProvider from configuration
 */
export default function buildGeminiEmbeddingsProvider(
	modelName?: string,
	apiKey?: string,
	threshold?: string,
): Promise<Either<AntboxError, GeminiEmbeddingsProvider>> {
	const parsedThreshold = threshold ? parseFloat(threshold) : 0.5;
	return Promise.resolve(
		right(
			new GeminiEmbeddingsProvider(modelName ?? "text-embedding-004", apiKey, parsedThreshold),
		),
	);
}
