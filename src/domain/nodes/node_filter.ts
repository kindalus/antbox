import { z } from "zod";

export const FilterOperatorSchema = z.enum([
	"==",
	"<=",
	">=",
	"<",
	">",
	"!=",
	"in",
	"not-in",
	"match",
	"contains",
	"contains-all",
	"contains-any",
	"not-contains",
	"contains-none",
]);

const arrayOperators = new Set(["in", "not-in", "contains-all", "contains-any", "contains-none"]);

export const NodeFilterSchema = z.tuple([
	z.string().min(1),
	FilterOperatorSchema,
	z.unknown(),
]).refine(([, operator, value]) => !arrayOperators.has(operator) || Array.isArray(value), {
	message: "Array filter operators require an array value",
});

export const NodeFiltersSchema = z.union([
	z.array(NodeFilterSchema),
	z.array(z.array(NodeFilterSchema)),
]);

export const FULLTEXT_FILTER_ERROR =
	"fulltext filters are only supported in searches, not in filters checked against one node";

/**
 * True when 1D or 2D filters contain `["fulltext", "match", …]`. Nodes have no fulltext field, so
 * filters checked against one node in memory (aspects, features, workflows, folder rules) cannot
 * use it.
 */
export function hasFulltextFilter(filters: readonly unknown[]): boolean {
	return filters.some((item) =>
		Array.isArray(item) &&
		(Array.isArray(item[0])
			? hasFulltextFilter(item)
			: item[0] === "fulltext" && item[1] === "match")
	);
}

export type NodeFilter = [
	field: string,
	operator: FilterOperator,
	value: unknown,
];

export type NodeFilters1D = NodeFilter[];
export type NodeFilters2D = NodeFilters1D[];
export type NodeFilters = NodeFilters1D | NodeFilters2D;

export type FilterOperator =
	| "=="
	| "<="
	| ">="
	| "<"
	| ">"
	| "!="
	| "in"
	| "not-in"
	| "match"
	| "contains"
	| "contains-all"
	| "contains-any"
	| "not-contains"
	| "contains-none";

export function isNodeFilters2D(
	filters: NodeFilters,
): filters is NodeFilters2D {
	if (filters.length === 0) {
		return false;
	}

	return filters[0].length === 0 || Array.isArray(filters[0][0]);
}
