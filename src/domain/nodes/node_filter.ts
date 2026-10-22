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
