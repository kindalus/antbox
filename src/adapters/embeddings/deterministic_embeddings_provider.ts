import { right } from "shared/either.ts";
import type { Either } from "shared/either.ts";
import type { AntboxError } from "shared/antbox_error.ts";
import type { Embedding, EmbeddingsProvider } from "domain/ai/embeddings_provider.ts";

/**
 * DeterministicEmbeddingsProvider - Hash-based deterministic vectors for testing.
 *
 * The same text always produces the same embedding vector.
 * No external API calls required — suitable for offline tests.
 */
export class DeterministicEmbeddingsProvider implements EmbeddingsProvider {
	readonly #dimensions: number;
	readonly #threshold: number;

	constructor(dimensions = 1536, threshold = 0.5) {
		this.#dimensions = dimensions;
		this.#threshold = Math.max(0, Math.min(1, threshold));
	}

	embed(texts: string[]): Promise<Either<AntboxError, Embedding[]>> {
		const embeddings = texts.map((text) => this.#createDeterministicEmbedding(text));
		return Promise.resolve(right(embeddings));
	}

	relevanceThreshold(): number {
		return this.#threshold;
	}

	#createDeterministicEmbedding(text: string): Embedding {
		const embedding: number[] = new Array(this.#dimensions);
		const hash = this.#simpleHash(text);

		for (let i = 0; i < this.#dimensions; i++) {
			const seed = hash + i;
			const value = Math.sin(seed) * 10000;
			embedding[i] = value - Math.floor(value);
		}

		return this.#normalize(embedding);
	}

	#simpleHash(text: string): number {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			const char = text.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash;
		}
		return Math.abs(hash);
	}

	#normalize(vector: number[]): number[] {
		const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
		if (magnitude === 0) return vector;
		return vector.map((val) => val / magnitude);
	}
}

/**
 * Factory function for loading DeterministicEmbeddingsProvider from configuration
 */
export default function buildDeterministicEmbeddingsProvider(
	dimensions?: string,
	threshold?: string,
): Promise<Either<AntboxError, DeterministicEmbeddingsProvider>> {
	const dims = dimensions ? parseInt(dimensions, 10) : 1536;
	const parsedThreshold = threshold ? parseFloat(threshold) : 0.5;
	return Promise.resolve(right(new DeterministicEmbeddingsProvider(dims, parsedThreshold)));
}
