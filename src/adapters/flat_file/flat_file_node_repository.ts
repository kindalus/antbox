import { InMemoryNodeRepository } from "adapters/inmem/inmem_node_repository.ts";
import { NodeFactory } from "domain/node_factory.ts";
import type { NodeLike } from "domain/node_like.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeMetadata } from "domain/nodes/node_metadata.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type { NodeFilterResult, NodeRepository } from "domain/nodes/node_repository.ts";

import { join } from "path";

import { AntboxError, UnknownError } from "shared/antbox_error.ts";
import { type Either, left, right } from "shared/either.ts";
import { copyFile, fileExistsSync } from "shared/os_helpers.ts";

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

			copyFile(dbFilePath, dbBackupFilePath);
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
				}, {} as Record<string, NodeLike>),
		);
	}

	#dataAsArray(): NodeMetadata[] {
		return Object.values(this.#base.data).map((m) => m.metadata);
	}

	#saveDb(path?: string) {
		const rows = this.#dataAsArray();
		const rawData = this.#encoder.encode(JSON.stringify(rows, null, 2));
		Deno.writeFileSync(path || this.#dbFilePath, rawData);
	}

	delete(uuid: string): Promise<Either<NodeNotFoundError, void>> {
		return this.#base
			.delete(uuid)
			.then((result) => {
				if (result.isRight()) {
					this.#saveDb();
				}

				return result;
			})
			.catch((err) => {
				console.error(err);
				return left(new NodeNotFoundError(uuid));
			});
	}

	update(node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
		return this.#base
			.update(node)
			.then((result) => {
				if (result.isRight()) {
					this.#saveDb();
				}

				return result;
			})
			.catch((err) => {
				console.error(err);
				return left(new NodeNotFoundError(node.uuid));
			});
	}

	add(node: NodeLike): Promise<Either<AntboxError, void>> {
		return this.#base
			.add(node)
			.then((result) => {
				if (result.isRight()) {
					this.#saveDb();
				}

				return result;
			})
			.catch((err) => {
				console.error(err);
				return left(new UnknownError(err));
			});
	}

	getByFid(fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		return this.#base.getByFid(fid);
	}

	getById(uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		return this.#base.getById(uuid);
	}

	filter(
		filters: NodeFilters,
		pageSize = 20,
		pageToken = 1,
	): Promise<NodeFilterResult> {
		return this.#base.filter(filters, pageSize, pageToken);
	}
}
