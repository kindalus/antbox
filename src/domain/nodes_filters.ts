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
import { isNodeFilters2D } from "./nodes/node_filter.ts";

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
			const filters = parseFilterString(value);
			return right(filters);
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
		if (!filters || !filters.length) return specificationFn(() => right(true));

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
		const satisfiesFn = filterFns[operator];

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
		const fields = fieldPath.split(".");

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

const filterFns: Record<FilterOperator, FilterFn> = {
	"==": (a, b) => a === b,
	"<=": (a, b) => a <= b,
	">=": (a, b) => a >= b,
	"<": (a, b) => a < b,
	">": (a, b) => a > b,
	"!=": (a, b) => a !== b,

	in: <T>(a: T, b: T) => (b as T[])?.includes(a as never),
	"not-in": <T>(a: T, b: T) => !(b as T[])?.includes(a),

	contains: <T>(a: T, b: T) => (a as T[])?.includes(b) || false,
	"contains-all": <T>(a: T, b: T) => (b as T[])?.every((v) => (a as T[])?.includes(v)),

	"contains-any": <T>(a: T, b: T) => (b as T[])?.some((v) => (a as T[])?.includes(v)),

	"not-contains": <T>(a: T, b: T) => !(a as T[])?.includes(b),
	"contains-none": <T>(a: T, b: T) => !(b as T[])?.every((v) => (a as T[])?.includes(v)),

	match: (a, b) => {
		const a1 = a as unknown as string;
		const b1 = b as unknown as string;

		const re = new RegExp(b1.replaceAll(/\s/g, ".*?"), "i");
		const match = a1?.match(re);

		return match !== undefined && match !== null;
	},
};

// A list of all valid operators, sorted by length descending.
// This is crucial to ensure we match "contains-all" before "contains", or ">=" before ">".
const OPERATORS: FilterOperator[] = [
	"contains-none",
	"contains-all",
	"contains-any",
	"not-contains",
	"not-in",
	"contains",
	"match",
	"==",
	"<=",
	">=",
	"!=",
	"in",
	"<",
	">",
];

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
	const trimmedInput = input.trim();

	// A simple string can't be empty.
	if (trimmedInput === "") {
		return false;
	}

	// If the entire string is quoted, treat it as a single literal value, not a query.
	if (trimmedInput.startsWith('"') && trimmedInput.endsWith('"')) {
		return false;
	}

	// The core logic: check for the presence of a valid operator
	// that actually separates a field from a value.
	for (const op of OPERATORS) {
		const idx = trimmedInput.indexOf(op);

		if (idx > -1) {
			// Check if there is something non-whitespace before the operator.
			const fieldPart = trimmedInput.substring(0, idx).trim();
			if (fieldPart === "") {
				continue; // Operator is at the start, not a valid query structure.
			}

			// Check if there is something non-whitespace after the operator.
			const valuePart = trimmedInput.substring(idx + op.length).trim();
			if (valuePart === "") {
				continue; // Operator is at the end, not a valid query structure.
			}

			// We found a valid operator separating a non-empty field and value.
			// This is enough to classify it as a query.
			return true;
		}
	}

	// No valid operator found that properly splits the string.
	return false;
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
	filterStr = filterStr.trim();

	const foundOperator = OPERATORS.find((op) => filterStr.includes(op));

	if (!foundOperator) {
		throw new Error(`Could not find a valid operator in filter: "${filterStr}"`);
	}

	const operatorIndex = filterStr.indexOf(foundOperator);

	const field = filterStr.substring(0, operatorIndex).trim();
	const rawValue = filterStr.substring(operatorIndex + foundOperator.length).trim();

	if (!field) {
		throw new Error(`Field cannot be empty in filter: "${filterStr}"`);
	}

	const value = parseValue(rawValue, foundOperator);

	return [field, foundOperator, value];
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
