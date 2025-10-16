import { join } from "path";

import type {
	VectorDatabase,
	VectorEntry,
	VectorSearchResult,
} from "application/vector_database.ts";
import type { Embedding } from "application/ai_model.ts";
import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { fileExistsSync } from "shared/os_helpers.ts";
import { promise } from "zod";

export default function buildFlatFileVectorDatabase(
	baseDir: string,
): Promise<Either<AntboxError, VectorDatabase>> {
	try {
		const db = new FlatFileVectorDatabase(baseDir);
		return Promise.resolve(right(db));
	} catch (error) {
		return Promise.resolve(left(new UnknownError((error as Error).message)));
	}
}

class FlatFileVectorDatabase implements VectorDatabase {
	readonly #dbFilePath: string;
	readonly #vectors: Map<string, VectorEntry> = new Map();

	constructor(baseDir: string) {
		if (!fileExistsSync(baseDir)) {
			Deno.mkdirSync(baseDir, { recursive: true });
		}

		this.#dbFilePath = join(baseDir, "vector_database.json");
		this.#loadFromDisk();
	}

	async upsert(entry: VectorEntry): Promise<Either<AntboxError, void>> {
		try {
			this.#vectors.set(entry.id, entry);
			await this.#persist();
			return right(undefined);
		} catch (error) {
			return left(this.#error(error));
		}
	}

	async upsertBatch(entries: VectorEntry[]): Promise<Either<AntboxError, void>> {
		try {
			for (const entry of entries) {
				this.#vectors.set(entry.id, entry);
			}
			await this.#persist();
			return right(undefined);
		} catch (error) {
			return left(this.#error(error));
		}
	}

	search(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult[]>> {
		try {
			const results = this.#vectors.values().toArray().map<VectorSearchResult>((entry) => ({
				id: entry.id,
				nodeUuid: entry.metadata.nodeUuid,
				score: this.#cosineSimilarity(queryVector, entry.vector),
				metadata: entry.metadata,
			}));

			results.sort((a, b) => b.score - a.score);

			return Promise.resolve(right(results.slice(0, topK)));
		} catch (error) {
			return Promise.resolve(left(this.#error(error)));
		}
	}

	async delete(id: string): Promise<Either<AntboxError, void>> {
		try {
			const existed = this.#vectors.delete(id);
			if (existed) {
				await this.#persist();
			}

			return right(undefined);
		} catch (error) {
			return left(this.#error(error));
		}
	}

	async deleteByNodeUuid(nodeUuid: string): Promise<Either<AntboxError, void>> {
		try {
			let mutated = false;

			for (const [id, entry] of this.#vectors.entries()) {
				if (entry.metadata.nodeUuid === nodeUuid) {
					this.#vectors.delete(id);
					mutated = true;
				}
			}

			if (mutated) {
				await this.#persist();
			}

			return right(undefined);
		} catch (error) {
			return left(this.#error(error));
		}
	}

	#loadFromDisk(): void {
		if (!fileExistsSync(this.#dbFilePath)) {
			return;
		}

		try {
			const raw = Deno.readTextFileSync(this.#dbFilePath);
			if (!raw.trim()) {
				return;
			}

			const entries = JSON.parse(raw) as VectorEntry[];

			for (const entry of entries) {
				this.#vectors.set(entry.id, entry);
			}
		} catch (error) {
			throw this.#error(error);
		}
	}

	async #persist(): Promise<void> {
		const data = JSON.stringify(Array.from(this.#vectors.values()));
		await Deno.writeTextFile(this.#dbFilePath, data);
	}

	#cosineSimilarity(vectorA: Embedding, vectorB: Embedding): number {
		if (vectorA.length !== vectorB.length) {
			throw new Error("Vectors must have the same length");
		}

		let dotProduct = 0;
		let magnitudeA = 0;
		let magnitudeB = 0;

		for (let i = 0; i < vectorA.length; i++) {
			dotProduct += vectorA[i] * vectorB[i];
			magnitudeA += vectorA[i] * vectorA[i];
			magnitudeB += vectorB[i] * vectorB[i];
		}

		magnitudeA = Math.sqrt(magnitudeA);
		magnitudeB = Math.sqrt(magnitudeB);

		if (magnitudeA === 0 || magnitudeB === 0) {
			return 0;
		}

		return dotProduct / (magnitudeA * magnitudeB);
	}

	#error(error: unknown): FlatFileVectorDatabaseError {
		const message = error instanceof Error ? error.message : String(error);
		return new FlatFileVectorDatabaseError(message);
	}

	// Exposed for tests/debugging if needed (parity with in-memory version)
	size(): number {
		return this.#vectors.size;
	}

	clear(): void {
		this.#vectors.clear();
	}
}

class FlatFileVectorDatabaseError extends AntboxError {
	constructor(message: string) {
		super("FlatFileVectorDatabaseError", message);
	}
}
