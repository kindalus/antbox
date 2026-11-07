import { z } from "zod";
import { type NodeFilters, NodeFiltersSchema } from "domain/nodes/node_filter.ts";
import type { NodeProperties } from "domain/nodes/node_properties.ts";

export const FIND_DOCUMENTS_DEFAULT_LIMIT = 10;
export const FIND_DOCUMENTS_MAX_LIMIT = 20;
export const FIND_DOCUMENTS_DEFAULT_MAX_CHARS = 4000;
export const FIND_DOCUMENTS_MAX_CHARS = 8000;
/** Ranked candidates read by the semantic and full-text modes. Their totals never exceed it. */
export const FIND_DOCUMENTS_SEARCH_WINDOW = 50;

export const FindDocumentsOptionsSchema = z.object({
	filters: NodeFiltersSchema.optional(),
	query: z.string().optional(),
	limit: z.number().int().positive().optional(),
	includeContent: z.boolean().optional(),
	maxCharsPerNode: z.number().int().positive().optional(),
});

export interface FindDocumentsOptions {
	/** Node filters (1D = AND, 2D = OR), including aspect properties and "@" parent filters. */
	filters?: NodeFilters;
	/** Natural-language text; ranks the nodes that pass the filters by meaning. */
	query?: string;
	/** Nodes to return, 10 by default and at most 20. */
	limit?: number;
	/** Return each node's stored text, true by default. */
	includeContent?: boolean;
	/** Characters of text per node, 4000 by default and at most 8000. */
	maxCharsPerNode?: number;
}

/**
 * - filters: no query, nodes matching the filters; total is exact.
 * - semantic: ranked by meaning within the filters; total counts the results above the relevance
 *   threshold within the search window.
 * - fulltext: semantic search unavailable or failed; ranked by full-text relevance within the
 *   filters; total counts the matches within the search window.
 */
export type FindDocumentsMode = "semantic" | "fulltext" | "filters";

export interface FoundDocument {
	uuid: string;
	title: string;
	mimetype: string;
	parent: string;
	description?: string;
	tags?: string[];
	aspects?: string[];
	properties?: NodeProperties;
	/** Relevance in [0, 1], absent in filters mode. */
	score?: number;
	/** Stored text without the metadata frontmatter, truncated to maxCharsPerNode. */
	content?: string;
	contentTruncated?: boolean;
}

export interface FindDocumentsResult {
	mode: FindDocumentsMode;
	total: number;
	/** True when total reached the search window, so more results may exist. */
	totalIsLowerBound?: boolean;
	returned: number;
	/** Why the mode differs from the one requested, for example a full-text fallback. */
	notice?: string;
	nodes: FoundDocument[];
}
