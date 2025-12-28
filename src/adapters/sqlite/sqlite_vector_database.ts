import { Database } from "jsr:@db/sqlite";

import type { Embedding } from "application/ai/ai_model.ts";
import type {
	VectorDatabase,
	VectorEntry,
	VectorSearchResult,
} from "application/ai/vector_database.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";

export class SqliteVectorError extends AntboxError {
	static ERROR_CODE = "SqliteVectorError";
	constructor(message: string) {
		super(SqliteVectorError.ERROR_CODE, message);
	}
}

export class SqliteVectorDatabase implements VectorDatabase {
	readonly #db: Database;

	constructor(baseFolder?: string) {
		if (baseFolder) {
			Deno.mkdirSync(baseFolder, { recursive: true });
			this.#db = new Database(`${baseFolder}/vectors.db`);
		} else {
			this.#db = new Database(":memory:");
		}

		this.#initialize();
	}

	#initialize(): void {
		this.#db.exec("PRAGMA journal_mode = WAL;");

		this.#db.exec(`
			CREATE TABLE IF NOT EXISTS vectors (
				id TEXT PRIMARY KEY,
				metadata JSON NOT NULL,
				vector JSON NOT NULL
			);
		`);

		this.#db.exec(
			"CREATE INDEX IF NOT EXISTS idx_vectors_node ON vectors(json_extract(metadata, '$.nodeUuid'));",
		);

		this.#db.function("cosine_similarity", this.#cosineSimilarityFn);
	}

	#cosineSimilarityFn = (vectorAJson: string, vectorBJson: string): number => {
		try {
			const vectorA: number[] = JSON.parse(vectorAJson);
			const vectorB: number[] = JSON.parse(vectorBJson);

			if (vectorA.length !== vectorB.length) {
				return 0;
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
		} catch {
			return 0;
		}
	};

	upsert(entry: VectorEntry): Promise<Either<AntboxError, void>> {
		try {
			const metadata = JSON.stringify(entry.metadata);
			const vector = JSON.stringify(entry.vector);

			this.#db.exec(
				`INSERT INTO vectors (id, metadata, vector) VALUES (?, ?, ?)
				 ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata, vector = excluded.vector`,
				[entry.id, metadata, vector],
			);

			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteVectorError(error.message)));
		}
	}

	upsertBatch(entries: VectorEntry[]): Promise<Either<AntboxError, void>> {
		try {
			this.#db.exec("BEGIN TRANSACTION");

			for (const entry of entries) {
				const metadata = JSON.stringify(entry.metadata);
				const vector = JSON.stringify(entry.vector);

				this.#db.exec(
					`INSERT INTO vectors (id, metadata, vector) VALUES (?, ?, ?)
					 ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata, vector = excluded.vector`,
					[entry.id, metadata, vector],
				);
			}

			this.#db.exec("COMMIT");

			return Promise.resolve(right(undefined));
		} catch (err) {
			this.#db.exec("ROLLBACK");
			const error = err as Error;
			return Promise.resolve(left(new SqliteVectorError(error.message)));
		}
	}

	search(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult[]>> {
		try {
			const queryVectorJson = JSON.stringify(queryVector);

			const rows = this.#db
				.prepare(
					`SELECT
						id,
						metadata,
						cosine_similarity(vector, ?) as similarity
					 FROM vectors
					 ORDER BY similarity DESC
					 LIMIT ?`,
				)
				.all(queryVectorJson, topK) as {
					id: string;
					metadata: string;
					similarity: number;
				}[];

			const results: VectorSearchResult[] = rows.map((row) => {
				const metadata = JSON.parse(row.metadata) as VectorEntry["metadata"];
				return {
					id: row.id,
					nodeUuid: metadata.nodeUuid,
					score: row.similarity,
					metadata,
				};
			});

			return Promise.resolve(right(results));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteVectorError(error.message)));
		}
	}

	delete(id: string): Promise<Either<AntboxError, void>> {
		try {
			this.#db.exec("DELETE FROM vectors WHERE id = ?", [id]);
			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteVectorError(error.message)));
		}
	}

	deleteByNodeUuid(nodeUuid: string): Promise<Either<AntboxError, void>> {
		try {
			this.#db.exec(
				"DELETE FROM vectors WHERE json_extract(metadata, '$.nodeUuid') = ?",
				[nodeUuid],
			);
			return Promise.resolve(right(undefined));
		} catch (err) {
			const error = err as Error;
			return Promise.resolve(left(new SqliteVectorError(error.message)));
		}
	}

	close(): void {
		this.#db.close();
	}
}
