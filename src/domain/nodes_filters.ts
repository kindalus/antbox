import { Either, left, right } from "shared/either.ts";
import { Logger } from "shared/logger.ts";
import type { NodeLike } from "./node_like.ts";
import {
	type Specification,
	specificationFn,
	type ValidationResult,
} from "shared/specification.ts";
import { ValidationError } from "shared/validation_error.ts";
import { AntboxError, BadRequestError } from "shared/antbox_error.ts";
import { isNodeFilters2D, NodeFiltersSchema } from "./nodes/node_filter.ts";

import type {
	FilterOperator,
	NodeFilter,
	NodeFilters,
	NodeFilters1D,
	NodeFilters2D,
} from "./nodes/node_filter.ts";

export class NodesFilters {
	static parse(value: string): Either<AntboxError, NodeFilters> {
		if (!value) {
			return left(new BadRequestError("Filter string is empty"));
		}

		if (!isFilterString(value)) {
			return left(new BadRequestError("Invalid filter string"));
		}
		try {
			const parsed = NodeFiltersSchema.safeParse(parseFilterString(value));
			return parsed.success
				? right(parsed.data)
				: left(new BadRequestError("Invalid node filters"));
		} catch (err) {
			Logger.error(err);
			return left(new BadRequestError("Failed to parse filter string"));
		}
	}

	static satisfiedBy(f: NodeFilters, n: NodeLike): ValidationResult {
		const spec = NodesFilters.nodeSpecificationFrom(f);
		return spec.isSatisfiedBy(n);
	}

	static nodeSpecificationFrom(filters: NodeFilters): Specification<NodeLike> {
		const validation = NodeFiltersSchema.safeParse(filters);
		if (!validation.success) {
			return specificationFn(() =>
				left(ValidationError.from(new BadRequestError("Invalid node filters")))
			);
		}
		if (!filters.length) return specificationFn(() => right(true));

		const isSatisfiedByFn = isNodeFilters2D(filters)
			? NodesFilters.#processNodeFilters(filters)
			: NodesFilters.#processNodeFilters([filters]);

		return specificationFn((n) => {
			const result = isSatisfiedByFn(n);

			if (result) {
				return right(true);
			}

			return left(
				ValidationError.from(
					new BadRequestError(`Node doesn't satisfy filters`),
				),
			);
		});
	}

	static #processNodeFilters(filters: NodeFilters2D): (n: NodeLike) => boolean {
		const predicates = filters.map((f) => {
			if (f.length === 0) {
				return () => true;
			}

			const predicates = f.map(NodesFilters.#nodeFilterToPredicate);
			return (n: NodeLike) => predicates.every((p) => p(n));
		});

		return (n: NodeLike) => predicates.some((p) => p(n));
	}

	static #nodeFilterToPredicate(filter: NodeFilter): (n: NodeLike) => boolean {
		const [field, operator, target] = filter;
		const satisfiesFn = operator === "match" ? matchTerms(target) : filterFns[operator];

		if (!satisfiesFn) {
			Logger.error(`Invalid filter operator: ${operator}`);
			return () => false;
		}

		return (node) => {
			const fieldValue = NodesFilters.#getFieldValue(node, field);

			return satisfiesFn(fieldValue, target);
		};
	}

	static #getFieldValue(node: NodeLike, fieldPath: string): unknown {
		const normalized = !fieldPath.startsWith("properties.") && fieldPath.includes(":")
			? `properties.${fieldPath}`
			: fieldPath;
		const fields = normalized.split(".");

		let acc: Record<string, unknown> | NodeLike = node;

		for (const field of fields) {
			acc = (acc as Record<string, unknown>)?.[field] as Record<
				string,
				unknown
			>;
		}

		return acc;
	}

	private constructor(public filters: NodeFilters2D) {}
}

type FilterFn = <T>(a: T, b: T) => boolean;

const filterFns: Record<Exclude<FilterOperator, "match">, FilterFn> = {
	"==": (a, b) => a === b,
	"<=": (a, b) => isOrderedValue(a) && isOrderedValue(b) && a <= b,
	">=": (a, b) => isOrderedValue(a) && isOrderedValue(b) && a >= b,
	"<": (a, b) => isOrderedValue(a) && isOrderedValue(b) && a < b,
	">": (a, b) => isOrderedValue(a) && isOrderedValue(b) && a > b,
	"!=": (a, b) => a !== b,

	in: <T>(a: T, b: T) => (b as T[])?.includes(a as never),
	"not-in": <T>(a: T, b: T) => !(b as T[])?.includes(a),

	contains: contains,
	"contains-all": <T>(a: T, b: T) => (b as T[]).every((v) => contains(a, v)),

	"contains-any": <T>(a: T, b: T) => (b as T[]).some((v) => contains(a, v)),

	"not-contains": <T>(a: T, b: T) => !contains(a, b),
	"contains-none": <T>(a: T, b: T) => !(b as T[]).some((v) => contains(a, v)),
};

function contains(value: unknown, target: unknown): boolean {
	if (Array.isArray(value)) return value.includes(target);
	const text = searchText(target);
	return typeof value === "string" && text !== undefined && value.includes(text);
}

function isOrderedValue(value: unknown): value is string | number {
	return typeof value === "string" || typeof value === "number";
}

function searchText(value: unknown): string | undefined {
	if ((typeof value === "object" && value !== null) || typeof value === "function") {
		return undefined;
	}
	return String(value);
}

function matchTerms(target: unknown): FilterFn {
	const query = searchText(target);
	if (query === undefined) return () => false;
	const terms = query.trim().toLowerCase().split(/\s+/);
	return (value) => {
		if (typeof value !== "string") return false;
		const text = value.toLowerCase();
		let start = 0;
		for (const term of terms) {
			const index = text.indexOf(term, start);
			if (index < 0) return false;
			start = index + term.length;
		}
		return true;
	};
}

// Word operators need whitespace so ordinary words such as "begin" remain search text.
const FILTER_EXPRESSION =
	/^([\w@.:-]+)(?:\s*(==|!=|<=|>=|<|>)\s*|\s+(contains-none|contains-all|contains-any|not-contains|not-in|contains|match|in)\s+)(.+)$/s;

// A set of operators that expect their value to be an array.
const ARRAY_VALUE_OPERATORS = new Set<FilterOperator>([
	"in",
	"not-in",
	"contains-all",
	"contains-any",
	"contains-none",
]);

/**
 * Determines if a string is likely a filter query or a simple string.
 * It checks for the presence of an operator that separates a non-empty field and value.
 * @param input The string to check.
 * @returns True if the string is a filter query, false otherwise.
 */
export function isFilterString(input: string): boolean {
	return FILTER_EXPRESSION.test(input.trim());
}

/**
 * Splits a string by a delimiter, but ignores delimiters inside of double quotes.
 * This is used for splitting the contents of a parenthesized list.
 * @param str The string to split.
 * @param delimiter The delimiter character.
 * @returns An array of strings.
 */
function splitRespectingQuotes(str: string, delimiter: string): string[] {
	const result: string[] = [];
	let currentSegment = "";
	let inQuote = false;

	for (const char of str) {
		if (char === '"') {
			inQuote = !inQuote;
		}

		if (char === delimiter && !inQuote) {
			result.push(currentSegment);
			currentSegment = "";
		} else {
			currentSegment += char;
		}
	}
	// Add the last segment to the result
	result.push(currentSegment);
	return result.filter((s) => s); // Filter out empty strings that might occur
}

/**
 * Splits a string by a delimiter, but ignores delimiters inside of double quotes or parentheses.
 * This is used for splitting by top-level OR (|) and AND (,) operators.
 * @param str The string to split.
 * @param delimiter The delimiter character.
 * @returns An array of strings.
 */
function splitTopLevel(str: string, delimiter: string): string[] {
	const result: string[] = [];
	let currentSegment = "";
	let parenLevel = 0;
	let inQuote = false;

	for (const char of str) {
		if (char === '"') {
			inQuote = !inQuote;
		} else if (char === "(" && !inQuote) {
			parenLevel++;
		} else if (char === ")" && !inQuote) {
			parenLevel--;
		}

		if (char === delimiter && !inQuote && parenLevel === 0) {
			result.push(currentSegment);
			currentSegment = "";
		} else {
			currentSegment += char;
		}
	}
	result.push(currentSegment);
	return result.filter((s) => s.trim());
}

/**
 * Parses the value part of a filter string.
 * It handles quoted strings and list values in parentheses for array-based operators.
 * @param valueStr The raw value string.
 * @param operator The operator being used, to determine if an array is expected.
 * @returns The parsed value (string or string[]).
 */
function parseValue(valueStr: string, operator: FilterOperator): unknown {
	valueStr = valueStr.trim();

	const unquote = (s: string) => {
		const trimmed = s.trim();
		if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
			return trimmed.substring(1, trimmed.length - 1);
		}
		return trimmed;
	};

	// For array operators, check for the new parenthesis syntax
	if (ARRAY_VALUE_OPERATORS.has(operator)) {
		if (valueStr.startsWith("(") && valueStr.endsWith(")")) {
			// Extract content within the parentheses
			const listContent = valueStr.substring(1, valueStr.length - 1);
			if (listContent.trim() === "") return []; // Handle empty list like "()"
			// Split by comma (respecting quotes) and unquote each part
			return splitRespectingQuotes(listContent, ",").map(unquote);
		} else {
			// If an array operator is used but the value is not in parentheses, it's a syntax error.
			throw new Error(
				`Array operator "${operator}" requires a value list in parentheses (), e.g., (value1, "value2").`,
			);
		}
	}

	// If the whole value is quoted (for non-array operators)
	if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
		return valueStr.substring(1, valueStr.length - 1);
	}

	// Otherwise, it's a simple unquoted string value
	return valueStr;
}

/**
 * Parses a single filter expression (e.g., "aspects contains-all (factura,coisas)").
 * @param filterStr The string for a single filter.
 * @returns A NodeFilter tuple.
 */
function parseSingleFilter(filterStr: string): NodeFilter {
	const expression = FILTER_EXPRESSION.exec(filterStr.trim());
	if (!expression) {
		throw new Error(`Could not find a valid operator in filter: "${filterStr}"`);
	}
	const operator = (expression[2] ?? expression[3]) as FilterOperator;
	return [expression[1], operator, parseValue(expression[4], operator)];
}

/**
 * Parses a string of AND-connected filters (e.g., "mimetype==application/json, aspects contains-all (...)").
 * @param groupStr A string representing a filter group.
 * @returns An array of NodeFilter tuples (NodeFilters1D).
 */
function parseFilterGroup(groupStr: string): NodeFilters1D {
	const parts = splitTopLevel(groupStr, ",");
	return parts.map((part) => parseSingleFilter(part.trim()));
}

/**
 * The main parser function that handles the entire filter notation string.
 * @param input The full filter string.
 * @returns The parsed filter structure as NodeFilters2D.
 */
export function parseFilterString(input: string): NodeFilters2D {
	if (!input || input.trim() === "") {
		return [];
	}

	// 1. Split by '|' for OR groups, respecting quotes and parentheses.
	const orGroups = splitTopLevel(input, "|");

	// 2. Map each OR group string into a NodeFilters1D array.
	const result = orGroups.map((groupStr) => parseFilterGroup(groupStr.trim()));

	return result;
}
