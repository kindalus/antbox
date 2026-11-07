import { EmbeddingsGeneratedEvent } from "domain/ai/embeddings_generated_event.ts";
import type { NodeFilters, NodeFilters1D, NodeFilters2D } from "domain/nodes/node_filter.ts";
import { isNodeFilters2D, NodeFiltersSchema } from "domain/nodes/node_filter.ts";
import { isFulltextFilter } from "domain/nodes/fulltext.ts";
import type { NodeFilterResult, VectorSearchResult } from "domain/nodes/node_repository.ts";
import type { RagDocument } from "domain/ai/rag_document.ts";
import { applyRelevanceThreshold } from "application/ai/relevance_threshold.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { Either, left, right } from "shared/either.ts";
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
		if (
			!Number.isSafeInteger(pageSize) || pageSize < 1 ||
			!Number.isSafeInteger(pageToken) || pageToken < 1 ||
			!Number.isSafeInteger(pageSize * pageToken)
		) {
			return left(new BadRequestError("Pagination must use positive safe integers"));
		}
		if (typeof filters === "string") {
			if (filters.startsWith("?")) {
				if (pageSize * pageToken > 10_000) {
					return left(
						new BadRequestError("Semantic search is limited to the first 10000 results"),
					);
				}
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

		const parsed = NodeFiltersSchema.safeParse(filters);
		if (!parsed.success) {
			return left(new BadRequestError("Invalid node filters"));
		}
		const processedFilters = await this.#resolveFilters(
			ctx,
			isNodeFilters2D(parsed.data) ? parsed.data : [parsed.data],
		);

		const searchOrErr = extractFulltext(processedFilters);
		if (searchOrErr.isLeft()) return left(searchOrErr.value);

		const { query, filters: otherFilters } = searchOrErr.value;
		if (query === undefined) {
			return right(await this.context.repository.filter(processedFilters, pageSize, pageToken));
		}

		return this.context.repository.fts(query, { filters: otherFilters, pageSize, pageToken });
	}

	/** True when the tenant can embed queries and store vectors. */
	supportsSemanticSearch(): boolean {
		return this.context.repository.supportsEmbeddings() && !!this.context.embeddingsProvider;
	}

	/**
	 * Documents readable by the principal that are closest in meaning to the text, with their
	 * indexed content. Used by the agents' semantic_search tool.
	 */
	async semanticDocuments(
		ctx: AuthenticationContext,
		text: string,
		topK: number,
	): Promise<Either<AntboxError, RagDocument[]>> {
		const rankedOrErr = await this.#rankByMeaning(ctx, text, topK);
		if (rankedOrErr.isLeft()) return left(rankedOrErr.value);

		return right(rankedOrErr.value.map(({ node, score, content }) => ({
			uuid: node.uuid,
			title: node.title,
			content,
			score,
		})));
	}

	/**
	 * Performs semantic search using the provided query string. Falls back to fulltext search when
	 * semantic search is unavailable or fails.
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
		if (!this.supportsSemanticSearch()) {
			Logger.warn(
				"Semantic search requested but AI features not available, falling back to fulltext search",
			);
			return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
		}

		let rankedOrErr: Either<AntboxError, VectorSearchResult["nodes"]>;
		try {
			rankedOrErr = await this.#rankByMeaning(ctx, query, pageSize * pageToken);
		} catch (error) {
			Logger.error("Semantic search failed:", error);
			return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
		}
		if (rankedOrErr.isLeft()) {
			Logger.error("Semantic search failed:", rankedOrErr.value);
			return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
		}

		const firstIndex = (pageToken - 1) * pageSize;
		const page = rankedOrErr.value.slice(firstIndex, firstIndex + pageSize);

		return right({
			nodes: page.map((result) => result.node),
			pageSize,
			pageToken,
			scores: Object.fromEntries(page.map((result) => [result.node.uuid, result.score])),
		});
	}

	/**
	 * Embeds the text and returns the topK readable nodes closest to it, best first. Permissions
	 * are applied by the repository before the topK cut, then the relevance threshold.
	 */
	async #rankByMeaning(
		ctx: AuthenticationContext,
		text: string,
		topK: number,
	): Promise<Either<AntboxError, VectorSearchResult["nodes"]>> {
		const provider = this.context.embeddingsProvider;
		if (!provider || !this.context.repository.supportsEmbeddings()) {
			return left(new BadRequestError("Semantic search is not available for this tenant"));
		}

		const embeddingsOrErr = await provider.embed([text]);
		if (embeddingsOrErr.isLeft()) return left(embeddingsOrErr.value);

		if (embeddingsOrErr.value.usage) {
			this.context.bus.publish(
				new EmbeddingsGeneratedEvent(ctx.principal.email, ctx.tenant, {
					nodeUuid: "query",
					model: embeddingsOrErr.value.model ?? "default",
					usage: embeddingsOrErr.value.usage,
					context: "search",
				}),
			);
		}

		const filters = await this.#resolveFilters(ctx, [[]]);
		const searchOrErr = await this.context.repository.vectorSearch(
			embeddingsOrErr.value.embeddings[0],
			topK,
			{ filters },
		);
		if (searchOrErr.isLeft()) return left(searchOrErr.value);

		return right(
			applyRelevanceThreshold(searchOrErr.value.nodes, provider.relevanceThreshold()).results,
		);
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

		const resolved = settled
			.filter((result) => result.status === "fulfilled")
			.map((result) => result.value)
			.filter((filter): filter is NodeFilters1D => filter !== undefined);

		if (resolved.some((filter) => filter.length === 0)) return [];

		// An empty repository filter means "all nodes", not "no matching permission branches".
		return resolved.length ? resolved : [[["uuid", "in", []]]];
	}

	async #toFiltersWithAtResolved(f: NodeFilters1D): Promise<NodeFilters1D | undefined> {
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

		for (const [, operator, value] of filters.filter((filter) => filter[0] === "parent")) {
			at.push(["uuid", operator, value]);
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
			return undefined;
		}

		const cleanFilters = filters.filter((f) => f[0] !== "parent");
		return [...cleanFilters, ["parent", "in", parentList]];
	}
}

/**
 * Splits `["fulltext", "match", q]` out of permission-resolved filters for fts(). Every OR group
 * must search the same text, because a repository runs one full-text query per search (MongoDB
 * allows a single top-level $text). Several fulltext filters in one group are joined.
 */
function extractFulltext(
	filters: NodeFilters2D,
): Either<BadRequestError, { query?: string; filters: NodeFilters2D }> {
	const queries = filters.map((group) =>
		group.filter(isFulltextFilter).map(([, , value]) => value)
	);
	if (queries.every((group) => group.length === 0)) return right({ filters });

	if (queries.flat().some((value) => typeof value !== "string" && typeof value !== "number")) {
		return left(new BadRequestError("fulltext match requires a text value"));
	}

	const texts = queries.map((group) => group.join(" ").trim().replaceAll(/\s+/g, " "));
	if (queries.some((group) => group.length === 0) || new Set(texts).size > 1) {
		return left(
			new BadRequestError("fulltext must apply to every filter group, with the same text"),
		);
	}

	return right({
		query: texts[0],
		filters: filters.map((group) => group.filter((filter) => !isFulltextFilter(filter))),
	});
}
