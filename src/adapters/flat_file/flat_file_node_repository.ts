import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { NodeFactory } from "domain/node_factory.ts";
import type { NodeLike } from "domain/node_like.ts";
import type { Embedding } from "domain/nodes/embedding.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { DuplicatedNodeError } from "domain/nodes/duplicated_node_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type {
	NodeFilterResult,
	NodeRepository,
	VectorSearchResult,
} from "domain/nodes/node_repository.ts";

import { dirname, join } from "path";

import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { fileExistsSync } from "shared/os_helpers.ts";
import { Logger } from "shared/logger.ts";

/**
 * Builds a file-backed NodeRepository that stores metadata in `nodes_repo.json`.
 *
 * @remarks
 * External setup:
 * - Ensure `baseDir` is writable and persisted.
 * - Deno requires `--allow-read` and `--allow-write` for file access.
 *
 * @example
 * const repoOrErr = await buildFlatFileStorageProvider("/var/lib/antbox");
 * if (repoOrErr.isRight()) {
 *   const repo = repoOrErr.value;
 * }
 */
export default function buildFlatFileStorageProvider(
	baseDir: string,
): Promise<Either<AntboxError, NodeRepository>> {
	const dbFilePath = join(baseDir, "nodes_repo.json");
	const dbBackupFilePath = join(baseDir, "nodes_repo.json.backup");

	try {
		if (!fileExistsSync(baseDir)) {
			Deno.mkdirSync(baseDir, { recursive: true });
		}

		let metadata = [];
		if (fileExistsSync(dbFilePath)) {
			const data = Deno.readTextFileSync(dbFilePath);
			metadata = JSON.parse(data);

			Deno.copyFileSync(dbFilePath, dbBackupFilePath);
		}

		return Promise.resolve(
			right(new FlatFileNodeRepository(dbFilePath, metadata)),
		);
	} catch (err) {
		return Promise.resolve(left(new UnknownError(err as string)));
	}
}

class FlatFileNodeRepository implements NodeRepository {
	readonly #dbFilePath: string;
	readonly #encoder: TextEncoder;

	#base: InMemoryNodeRepository;

	constructor(dbPath: string, data: NodeMetadata[] = []) {
		this.#dbFilePath = dbPath;
		this.#encoder = new TextEncoder();

		this.#base = new InMemoryNodeRepository(
			data.filter((d) => d)
				.reduce((acc, m) => {
					acc[m.uuid] = NodeFactory.from(m).right;
					return acc;
				}, Object.create(null) as Record<string, NodeLike>),
		);
	}

	#saveDb(rows: NodeMetadata[]) {
		const rawData = this.#encoder.encode(JSON.stringify(rows, null, 2));
		const temporaryPath = Deno.makeTempFileSync({ dir: dirname(this.#dbFilePath) });
		try {
			Deno.writeFileSync(temporaryPath, rawData);
			Deno.renameSync(temporaryPath, this.#dbFilePath);
		} catch (error) {
			Deno.removeSync(temporaryPath);
			throw error;
		}
	}

	delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		const records = this.#base.data;
		if (!records[uuid]) return Promise.resolve(left(new NodeNotFoundError(uuid)));
		delete records[uuid];
		try {
			this.#saveDb(Object.values(records).map((node) => node.metadata));
			return this.#base.delete(uuid);
		} catch (error) {
			Logger.error(error);
			return Promise.resolve(left(new UnknownError((error as Error).message)));
		}
	}

	update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
		const records = this.#base.data;
		if (!records[node.uuid]) return Promise.resolve(left(new NodeNotFoundError(node.uuid)));
		try {
			const snapshot = NodeFactory.from(structuredClone(node.metadata));
			if (snapshot.isLeft()) return Promise.resolve(left(snapshot.value));
			records[node.uuid] = snapshot.value;
			this.#saveDb(Object.values(records).map((node) => node.metadata));
			return this.#base.update(snapshot.value);
		} catch (error) {
			Logger.error(error);
			return Promise.resolve(left(new UnknownError((error as Error).message)));
		}
	}

	touch(uuid: string): Promise<Either<AntboxError, void>> {
		const current = this.#base.data[uuid];
		if (!current) return Promise.resolve(left(new NodeNotFoundError(uuid)));
		const updated = NodeFactory.from({
			...current.metadata,
			modifiedTime: new Date().toISOString(),
		});
		if (updated.isLeft()) return Promise.resolve(left(updated.value));
		// Both the snapshot and persistence run synchronously, without another write between them.
		return this.update(updated.value);
	}

	add(node: NodeLike): Promise<Either<AntboxError, void>> {
		const records = this.#base.data;
		if (records[node.uuid]) return Promise.resolve(left(new DuplicatedNodeError(node.uuid)));
		try {
			const snapshot = NodeFactory.from(structuredClone(node.metadata));
			if (snapshot.isLeft()) return Promise.resolve(left(snapshot.value));
			records[node.uuid] = snapshot.value;
			this.#saveDb(Object.values(records).map((node) => node.metadata));
			return this.#base.add(snapshot.value);
		} catch (error) {
			Logger.error(error);
			return Promise.resolve(left(new UnknownError((error as Error).message)));
		}
	}

	getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		return this.#base.getByFid(fid);
	}

	getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		return this.#base.getById(uuid);
	}

	getEmbeddingContents(uuids: string[]): Promise<Either<AntboxError, Record<string, string>>> {
		return this.#base.getEmbeddingContents(uuids);
	}

	filter(
		filters: NodeFilters,
		pageSize = 20,
		pageToken = 1,
	): Promise<NodeFilterResult> {
		return this.#base.filter(filters, pageSize, pageToken);
	}

	supportsEmbeddings(): boolean {
		return this.#base.supportsEmbeddings();
	}

	upsertEmbedding(
		uuid: string,
		embedding: Embedding,
		contentMd: string,
	): Promise<Either<AntboxError, void>> {
		return this.#base.upsertEmbedding(uuid, embedding, contentMd);
	}

	vectorSearch(
		queryVector: Embedding,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult>> {
		return this.#base.vectorSearch(queryVector, topK);
	}

	deleteEmbedding(uuid: string): Promise<Either<AntboxError, void>> {
		return this.#base.deleteEmbedding(uuid);
	}

	aggregateTotalSize(): Promise<Either<AntboxError, number>> {
		return this.#base.aggregateTotalSize();
	}
}
