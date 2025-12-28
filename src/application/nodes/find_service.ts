import type { AuthenticationContext } from "../security/authentication_context.ts";
import type { NodeServiceContext } from "./node_service_context.ts";
import type {
	NodeFilter,
	NodeFilters,
	NodeFilters1D,
	NodeFilters2D,
} from "domain/nodes/node_filter.ts";
import { isNodeFilters2D } from "domain/nodes/node_filter.ts";
import { NodesFilters } from "domain/nodes_filters.ts";
import type { NodeFilterResult } from "domain/nodes/node_repository.ts";
import { AntboxError } from "shared/antbox_error.ts";
import { Either, right } from "shared/either.ts";
import { Nodes } from "domain/nodes/nodes.ts";
import type { AuthorizationService } from "../security/authorization_service.ts";
import { FolderNode } from "domain/nodes/folder_node.ts";
import { Users } from "domain/users_groups/users.ts";
import { Groups } from "domain/users_groups/groups.ts";

/**
 * Service responsible for finding nodes in the repository.
 *
 * This service centralizes all node finding logic including:
 * - String parsing and content search
 * - Semantic search using vector embeddings
 * - Permission resolution
 * - Special filter resolution (@ filters)
 * - Repository querying with pagination
 */
export class FindService {
	constructor(
		private readonly context: NodeServiceContext,
		private readonly authorizationService: AuthorizationService,
	) {}

	/**
	 * Finds nodes based on filters, with support for semantic search and permission checks.
	 *
	 * This is a complex method that performs multiple stages of processing:
	 *
	 * 1. **String Parsing Stage**: If filters are provided as a string:
	 *    - Checks if string starts with "?" for semantic search
	 *    - Otherwise attempts to parse it as structured filters
	 *    - Falls back to fulltext search if parsing fails
	 *
	 * 2. **Semantic Search Stage**: Detects semantic search (string starting with "?")
	 *    - Uses vector embeddings to find semantically similar content
	 *    - Replaces query with UUID-based filter from results
	 *    - Preserves relevance scores for ranking
	 *
	 * 3. **Permission Resolution Stage**: Transforms filters to respect permissions
	 *    - Adds permission constraints based on user's authentication context
	 *    - Ensures users only see nodes they have "Read" access to
	 *    - Expands filters to include permission checks
	 *
	 * 4. **Special Filter Resolution Stage**: Resolves special "@" filters
	 *    - Processes dynamic filters like "@me" (current user)
	 *    - Handles async resolution of filter values
	 *    - Filters out any failed resolutions
	 *
	 * 5. **Repository Query Stage**: Executes the processed filters
	 *    - Applies pagination (pageSize, pageToken)
	 *    - Returns matching nodes with metadata
	 *    - Attaches semantic search scores if applicable
	 *
	 * @param ctx - Authentication context for permission checks
	 * @param filters - NodeFilters (structured) or string (for parsing/fulltext/semantic search)
	 * @param pageSize - Number of results per page (default: 20)
	 * @param pageToken - Page number for pagination (default: 1)
	 * @returns Either an error or the filtered node results with pagination info
	 *
	 * @example
	 * ```typescript
	 * // Structured filter
	 * const result = await findService.find(ctx, [["mimetype", "==", "image/png"]], 10, 1);
	 *
	 * // String fulltext search
	 * const result = await findService.find(ctx, "meeting notes", 20, 1);
	 *
	 * // Semantic search (starts with ?)
	 * const result = await findService.find(ctx, "?what is the meaning of life", 50, 1);
	 * ```
	 */
	async find(
		ctx: AuthenticationContext,
		filters: NodeFilters | string,
		pageSize = 20,
		pageToken = 1,
	): Promise<Either<AntboxError, NodeFilterResult>> {
		// Stage 1: Handle string-based filters
		if (typeof filters === "string") {
			// Check if this is a semantic search query (starts with ?)
			if (filters.startsWith("?")) {
				const semanticQuery = filters.substring(1).trim();
				return this.#performSemanticSearch(ctx, semanticQuery, pageSize, pageToken);
			}

			const filtersOrErr = NodesFilters.parse(filters);

			if (filtersOrErr.isRight()) {
				return this.find(ctx, filtersOrErr.value, pageSize, pageToken);
			}

			console.debug("defaulting to fulltext search");
			return this.find(ctx, [["fulltext", "match", filters]], pageSize, pageToken);
		}

		// Normalize filters to 2D array format
		filters = isNodeFilters2D(filters) ? filters : [filters];

		// Stage 2: Add permission constraints to filters
		const stage1 = filters.reduce(
			this.authorizationService.toFiltersWithPermissionsResolved(ctx, "Read"),
			[],
		);

		// Stage 3: Resolve special "@" filters (async operations)
		const batch = stage1.map((f) => this.#toFiltersWithAtResolved(f));
		const stage2 = await Promise.allSettled(batch);
		const stage3 = stage2.filter((r) => r.status === "fulfilled").map((r) => r.value);
		const processedFilters = stage3.filter((f) => f.length);

		// Stage 4: Execute repository query with processed filters
		const r = await this.context.repository.filter(
			processedFilters,
			pageSize,
			pageToken,
		);

		return right(r);
	}

	/**
	 * Performs semantic search using the provided query string.
	 */
	async #performSemanticSearch(
		ctx: AuthenticationContext,
		query: string,
		pageSize: number,
		pageToken: number,
	): Promise<Either<AntboxError, NodeFilterResult>> {
		// Check if repository supports embeddings and embedding model is available
		if (!this.context.repository.supportsEmbeddings() || !this.context.embeddingModel) {
			console.warn(
				"Semantic search requested but AI features not available, falling back to fulltext search",
			);
			return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
		}

		try {
			// Generate embedding for query using embedding model
			const embeddingsOrErr = await this.context.embeddingModel.embed([query]);
			if (embeddingsOrErr.isLeft()) {
				console.error("Failed to generate embedding for query:", embeddingsOrErr.value);
				// Fallback to fulltext search
				return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
			}

			const queryEmbedding = embeddingsOrErr.value[0];

			// Search using repository's vector search
			const searchOrErr = await this.context.repository.vectorSearch(
				queryEmbedding,
				100, // topK - return top 100 results
			);

			if (searchOrErr.isLeft()) {
				console.error("Vector search failed:", searchOrErr.value);
				// Fallback to fulltext search
				return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
			}

			const results = searchOrErr.value;
			const uuids = results.nodes.map((r) => r.node.uuid);
			const scores: Record<string, number> = {};
			for (const result of results.nodes) {
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

			// Use the UUIDs from semantic search as a filter
			const filters: NodeFilters2D = [[["uuid", "in", uuids] as NodeFilter]];

			// Apply permission filters and execute query
			const stage1 = filters.reduce(
				this.authorizationService.toFiltersWithPermissionsResolved(ctx, "Read"),
				[],
			);

			const batch = stage1.map((f) => this.#toFiltersWithAtResolved(f));
			const stage2 = await Promise.allSettled(batch);
			const stage3 = stage2.filter((r) => r.status === "fulfilled").map((r) => r.value);
			const processedFilters = stage3.filter((f) => f.length);

			const r = await this.context.repository.filter(
				processedFilters,
				pageSize,
				pageToken,
			);

			// Sort results by score (semantic relevance)
			r.nodes.sort((a, b) => (scores[b.uuid] ?? 0) - (scores[a.uuid] ?? 0));

			return right(r);
		} catch (error) {
			console.error("Semantic search failed:", error);
			// Fallback to fulltext search
			return this.find(ctx, [["fulltext", "match", query]], pageSize, pageToken);
		}
	}

	/**
	 * Resolves special "@" filters in the filter set.
	 * "@" filters are placeholders that get replaced with actual parent UUIDs.
	 */
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

		// Since the root folder is not stored in the repository, we need to handle it separately
		const spec = NodesFilters.nodeSpecificationFrom(at);
		const rootFolder = FolderNode.create({
			uuid: Nodes.ROOT_FOLDER_UUID,
			fid: Nodes.ROOT_FOLDER_UUID,
			title: "Root",
			parent: Nodes.ROOT_FOLDER_UUID,
			owner: Users.ROOT_USER_EMAIL,
			group: Groups.ADMINS_GROUP_UUID,
			filters: [["mimetype", "in", [
				Nodes.FOLDER_MIMETYPE,
				Nodes.SMART_FOLDER_MIMETYPE,
			]]],
			permissions: {
				group: ["Read", "Write", "Export"],
				authenticated: ["Read"],
				anonymous: [],
				advanced: {},
			},
		}).right;

		const sysFolders = spec.isSatisfiedBy(rootFolder).isRight() ? [rootFolder] : [];

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
