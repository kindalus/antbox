import type { NodeFilters, NodeFilters1D, NodeFilters2D } from "domain/nodes/node_filter.ts";
import { isNodeFilters2D } from "domain/nodes/node_filter.ts";
import type { NodeFilterResult } from "domain/nodes/node_repository.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Either, right } from "shared/either.ts";
import { Logger } from "shared/logger.ts";
import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { AuthorizationService } from "../security/authorization_service.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import { createRootFolder } from "./root_folder.ts";

/** Finds nodes while applying permissions, dynamic filters, and semantic ranking. */
export class FindService {
	constructor(
		private readonly context: NodeServiceContext,
		private readonly authorizationService: AuthorizationService,
	) {}

	async find(
		ctx: AuthenticationContext,
		filters: NodeFilters | string,
		pageSize = 20,
		pageToken = 1,
	): Promise<
		Either<
			AntboxError,
			NodeFilterResult & { scores?: Record<string, number> }
		>
	> {
		if (typeof filters === "string") {
			if (filters.startsWith("?")) {
				const semanticQuery = filters.substring(1).trim();
				return this.#performSemanticSearch(ctx, semanticQuery, pageSize, pageToken);
			}

			const filtersOrErr = NodesFilters.parse(filters);

			if (filtersOrErr.isRight()) {
				return this.find(ctx, filtersOrErr.value, pageSize, pageToken);
			}

			Logger.debug("defaulting to fulltext search");
			return this.find(ctx, [["fulltext", "match", filters]], pageSize, pageToken);
		}

		const normalizedFilters = isNodeFilters2D(filters) ? filters : [filters];
		const processedFilters = await this.#resolveFilters(ctx, normalizedFilters);
		return right(await this.context.repository.filter(processedFilters, pageSize, pageToken));
	}

	/**
	 * Performs semantic search using the provided query string.
	 */
	async #performSemanticSearch(
		ctx: AuthenticationContext,
		query: string,
		pageSize: number,
		pageToken: number,
	): Promise<
		Either<
			AntboxError,
			NodeFilterResult & { scores?: Record<string, number> }
		>
	> {
		// Check if repository supports embeddings and embedding model is available
		if (!this.context.repository.supportsEmbeddings() || !this.context.embeddingsProvider) {
			Logger.warn(
				"Semantic search requested but AI features not available, falling back to fulltext search",
			);
			return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
		}

		const threshold = this.context.embeddingsProvider.relevanceThreshold();

		try {
			// Generate embedding for query using embedding model
			const embeddingsOrErr = await this.context.embeddingsProvider.embed([query]);
			if (embeddingsOrErr.isLeft()) {
				Logger.error("Failed to generate embedding for query:", embeddingsOrErr.value);
				// Fallback to fulltext search
				return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
			}

			const queryEmbedding = embeddingsOrErr.value.embeddings[0];

			// Search using repository's vector search
			const topK = Math.max(100, pageSize * pageToken);
			const searchOrErr = await this.context.repository.vectorSearch(queryEmbedding, topK);

			if (searchOrErr.isLeft()) {
				Logger.error("Vector search failed:", searchOrErr.value);
				// Fallback to fulltext search
				return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
			}

			const results = searchOrErr.value.nodes.filter((result) => result.score >= threshold);
			const uuids = results.map((r) => r.node.uuid);
			const scores: Record<string, number> = {};
			for (const result of results) {
				scores[result.node.uuid] = result.score;
			}

			// If no results, return empty
			if (uuids.length === 0) {
				return right({
					nodes: [],
					pageSize,
					pageToken,
				});
			}

			const processedFilters = await this.#resolveFilters(ctx, [[["uuid", "in", uuids]]]);
			const r = await this.context.repository.filter(
				processedFilters,
				Number.MAX_SAFE_INTEGER,
				1,
			);

			// Sort results by score (semantic relevance)
			r.nodes.sort((a, b) => (scores[b.uuid] ?? 0) - (scores[a.uuid] ?? 0));

			const firstIndex = (pageToken - 1) * pageSize;
			const nodes = r.nodes.slice(firstIndex, firstIndex + pageSize);
			const pageScores = Object.fromEntries(
				nodes.map((node) => [node.uuid, scores[node.uuid]]),
			);

			return right({
				nodes,
				pageSize,
				pageToken,
				scores: pageScores,
			});
		} catch (error) {
			Logger.error("Semantic search failed:", error);
			// Fallback to fulltext search
			return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
		}
	}

	async #resolveFilters(
		ctx: AuthenticationContext,
		filters: NodeFilters2D,
	): Promise<NodeFilters2D> {
		const permissionFilters = filters.reduce(
			this.authorizationService.toFiltersWithPermissionsResolved(ctx, "Read"),
			[],
		);
		const settled = await Promise.allSettled(
			permissionFilters.map((filter) => this.#toFiltersWithAtResolved(filter)),
		);

		return settled
			.filter((result) => result.status === "fulfilled")
			.map((result) => result.value)
			.filter((filter) => filter.length);
	}

	async #toFiltersWithAtResolved(f: NodeFilters1D): Promise<NodeFilters1D> {
		if (!f.some((f) => f[0].startsWith("@"))) {
			return f;
		}

		const [at, filters] = f.reduce(
			(acc, cur) => {
				if (cur[0].startsWith("@")) {
					acc[0].push([cur[0].substring(1), cur[1], cur[2]]);
					return acc;
				}

				acc[1].push(cur);
				return acc;
			},
			[[], []] as [NodeFilters1D, NodeFilters1D],
		);

		at.push(["mimetype", "==", Nodes.FOLDER_MIMETYPE]);

		const parentFilter = filters.find((f) => f[0] === "parent");
		if (parentFilter) {
			at.push(["uuid", parentFilter[1], parentFilter[2]]);
		}

		// The root folder is not stored in the repository.
		const spec = NodesFilters.nodeSpecificationFrom(at);
		const root = createRootFolder();
		const sysFolders = spec.isSatisfiedBy(root).isRight() ? [root] : [];

		const result = await this.context.repository.filter(
			at,
			Number.MAX_SAFE_INTEGER,
			1,
		);
		const parentList = [
			...result.nodes.map((n) => n.uuid),
			...sysFolders.map((n) => n.uuid),
		];

		if (parentList.length === 0) {
			return [];
		}

		const cleanFilters = filters.filter((f) => f[0] !== "parent");
		return [...cleanFilters, ["parent", "in", parentList]];
	}
}
