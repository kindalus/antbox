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

export const SELF_REFERENCE_FILTER_ERROR =
	"${field} values are only supported in folder child filters and aspect validationFilters";

const SELF_REFERENCE = /^\$\{(.*)\}$/s;
const REFERENCE_FIELD = /^[^@\s{}$][^\s{}$]*$/;

/**
 * The field that a `${field}` filter value names, or undefined when the value is not one. Only a
 * value that is exactly `${…}` is a reference; text such as `FT-${number}` stays literal.
 */
export function selfReferenceField(value: unknown): string | undefined {
	return typeof value === "string" ? SELF_REFERENCE.exec(value)?.[1] : undefined;
}

export const NodeFilterSchema = z.tuple([
	z.string().min(1),
	FilterOperatorSchema,
	z.unknown(),
]).refine(
	([, operator, value]) =>
		!arrayOperators.has(operator) || Array.isArray(value) ||
		selfReferenceField(value) !== undefined,
	{ message: "Array filter operators require an array value" },
).refine(([, , value]) => {
	const field = selfReferenceField(value);
	return field === undefined || (REFERENCE_FIELD.test(field) && field !== "fulltext");
}, {
	message:
		"A ${field} value must name a field of the node itself, such as ${invoice:date}; @ fields are not allowed",
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

/**
 * True when 1D or 2D filters have a `${field}` value. Such values read the node being written, so
 * only folder child filters and aspect validationFilters can use them.
 */
export function hasSelfReference(filters: readonly unknown[]): boolean {
	return filters.some((item) =>
		Array.isArray(item) &&
		(Array.isArray(item[0]) ? hasSelfReference(item) : selfReferenceField(item[2]) !== undefined)
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
