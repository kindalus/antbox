import { left, right } from "shared/either.ts";
import type { Either } from "shared/either.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Logger } from "shared/logger.ts";
import type {
	Embedding,
	EmbeddingsProvider,
	EmbeddingsResult,
} from "domain/ai/embeddings_provider.ts";
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
 * const provider = new GeminiEmbeddingsProvider("gemini-embedding-001");
 */
export class GeminiEmbeddingsProvider implements EmbeddingsProvider {
	readonly #client: GoogleGenAI;
	readonly #modelName: string;
	readonly #threshold: number;

	constructor(
		modelName = "gemini-embedding-2-preview",
		apiKey?: string,
		threshold = 0.6,
	) {
		const key = apiKey ?? Deno.env.get("GOOGLE_API_KEY") ?? Deno.env.get("GEMINI_API_KEY");
		if (!key) {
			Logger.error("GOOGLE_API_KEY nor GEMINI_API_KEY is set");
			Deno.exit(1);
		}
		this.#modelName = modelName;
		this.#threshold = Math.max(0, Math.min(1, threshold));
		this.#client = new GoogleGenAI({ apiKey: key });
	}

	/**
	 * Normalizes an array of numbers (embedding) using L2 normalization.
	 * @param values - The input array of numbers.
	 * @returns A new array representing the normalized unit vector.
	 */
	#normalizeEmbedding(values: number[]): number[] {
		// 1. Calculate the L2 norm (Euclidean length)
		// reduce() sums up the squares of all the numbers in the array
		const sumOfSquares = values.reduce((sum, val) => sum + val * val, 0);
		const norm = Math.sqrt(sumOfSquares);

		// Handle the edge case where the array is all zeros to prevent division by zero (NaN)
		if (norm === 0) {
			return [...values];
		}

		// 2. Divide each number by the norm to create the normalized array
		return values.map((val) => val / norm);
	}

	async embed(texts: string[]): Promise<Either<AntboxError, EmbeddingsResult>> {
		try {
			const embeddings: Embedding[] = [];
			let totalPromptTokens = 0;
			let totalTokens = 0;

			for (const text of texts) {
				const [countResponse, embedResponse] = await Promise.all([
					this.#client.models.countTokens({
						model: this.#modelName,
						contents: text,
					}).catch(() => null),
					this.#client.models.embedContent({
						model: this.#modelName,
						contents: text,
						config: {
							taskType: "RETRIEVAL_DOCUMENT",
							outputDimensionality: 768,
						},
					}),
				]);

				if (countResponse) {
					totalTokens += countResponse.totalTokens ?? 0;
					totalPromptTokens += countResponse.totalTokens ?? 0; // Embeddings models only consume prompt tokens
				}

				if (embedResponse.embeddings && embedResponse.embeddings[0]?.values) {
					const normalized = this.#normalizeEmbedding(embedResponse.embeddings[0].values);
					embeddings.push(normalized);
				} else {
					return left(
						new AntboxError(
							"GeminiEmbeddingsError",
							`No embedding values returned for text: ${text.substring(0, 50)}...`,
						),
					);
				}
			}

			return right({
				embeddings,
				usage: {
					promptTokens: totalPromptTokens,
					completionTokens: 0,
					totalTokens,
				},
			});
		} catch (error) {
			return left(
				new AntboxError(
					"GeminiEmbeddingsError",
					`Failed to generate embeddings: ${error}`,
				),
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
	return Promise.resolve(
		right(
			new GeminiEmbeddingsProvider(
				modelName,
				apiKey,
				threshold ? parseFloat(threshold) : undefined,
			),
		),
	);
}
