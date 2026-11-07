import { FileNode } from "domain/nodes/file_node.ts";
import type { Embedding } from "domain/nodes/embedding.ts";
import type { NodeFilters } from "domain/nodes/node_filter.ts";
import type { NodeLike } from "domain/node_like.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { Users } from "domain/users_groups/users.ts";
import type {
	EmbeddingStatusCounts,
	EmbeddingStatusRecord,
	FtsOptions,
	FtsResult,
	NodeContent,
	NodeFilterResult,
	NodeRepository,
	VectorSearchOptions,
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

	touch(_uuid: string): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	getByFid(_fid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		return Promise.resolve(right(this.#nullNode));
	}

	getById(_uuid: string): Promise<Either<NodeNotFoundError, NodeLike>> {
		return Promise.resolve(right(this.#nullNode));
	}

	getContents(_uuids: string[]): Promise<Either<AntboxError, Record<string, string>>> {
		return Promise.resolve(right({}));
	}

	saveContent(_uuid: string, _content: NodeContent): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	fts(_query: string, options: FtsOptions): Promise<Either<AntboxError, FtsResult>> {
		return Promise.resolve(right({
			nodes: [],
			pageSize: options.pageSize,
			pageToken: options.pageToken,
			scores: {},
		}));
	}

	listWithoutSearchContent(_limit: number): Promise<Either<AntboxError, string[]>> {
		return Promise.resolve(right([]));
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

	countMatching(_filters: NodeFilters): Promise<Either<AntboxError, number>> {
		return Promise.resolve(right(0));
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
		_options?: VectorSearchOptions,
	): Promise<Either<AntboxError, VectorSearchResult>> {
		return Promise.resolve(right({ nodes: [] }));
	}

	deleteEmbedding(_uuid: string): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	setEmbeddingStatus(
		_uuid: string,
		_status: "failed" | "skipped",
		_error?: string,
	): Promise<Either<AntboxError, void>> {
		return Promise.resolve(right(undefined));
	}

	getEmbeddingStatuses(
		_uuids: string[],
	): Promise<Either<AntboxError, Record<string, EmbeddingStatusRecord>>> {
		return Promise.resolve(right({}));
	}

	countEmbeddingStatuses(): Promise<Either<AntboxError, EmbeddingStatusCounts>> {
		return Promise.resolve(right({ indexed: 0, failed: 0, skipped: 0, pending: 0 }));
	}

	aggregateTotalSize(): Promise<Either<AntboxError, number>> {
		return Promise.resolve(right(0));
	}

	#nullNode = FileNode.create({
		title: "Null",
		mimetype: "null/null",
		owner: Users.ANONYMOUS_USER_EMAIL,
	}).right;
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
