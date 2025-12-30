import { FileNode } from "domain/nodes/file_node.ts";
import type { Embedding } from "domain/nodes/embedding.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import type {
	NodeFilterResult,
	NodeRepository,
	VectorSearchResult,
} from "domain/nodes/node_repository.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { type Either, right } from "shared/either.ts";

export class NullNodeRepository implements NodeRepository {
	get(_uuid: string): Promise<Either<AntboxError, NodeLike>> {
		return Promise.resolve(right(this.#nullNode));
	}

	add(_node: NodeLike): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	delete(_uuid: string): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	update(_node: NodeLike): Promise<Either<NodeNotFoundError, void>> {
		return Promise.resolve(right(undefined));
	}

	getByFid(_fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		return Promise.resolve(right(this.#nullNode));
	}

	getById(_uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		return Promise.resolve(right(this.#nullNode));
	}

	filter(
		_filters: NodeFilters,
		pageSize?: number,
		pageToken?: number,
	): Promise<NodeFilterResult> {
		return Promise.resolve({
			nodes: [],
			pageToken: pageToken ?? 1,
			pageSize: pageSize ?? 20,
		});
	}

	supportsEmbeddings(): boolean {
		return false;
	}

	upsertEmbedding(_uuid: string, _embedding: Embedding): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	vectorSearch(
		_queryVector: Embedding,
		_topK: number,
	): Promise<Either<AntboxError, VectorSearchResult>> {
		return Promise.resolve(right({ nodes: [] }));
	}

	deleteEmbedding(_uuid: string): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	#nullNode = FileNode.create({ title: "Null", mimetype: "null/null" }).right;
}

/**
 * Builds a no-op NodeRepository that returns a synthetic node and ignores writes.
 *
 * @remarks
 * External setup: none. Use for tests or when persistence is intentionally disabled.
 *
 * @example
 * const repoOrErr = await buildNullNodeRepository();
 * if (repoOrErr.isRight()) {
 *   const repo = repoOrErr.value;
 * }
 */
export default function buildNullNodeRepository(): Promise<
	Either<AntboxError, NodeRepository>
> {
	return Promise.resolve(right(new NullNodeRepository()));
}
