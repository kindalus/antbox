import type { NodeFilter, NodeFilters2D } from "./node_filter.ts";

/** Words shorter than this are left out of the stored fulltext. */
const MIN_WORD_LENGTH = 3;

function normalizedWords(text: string): string[] {
	return text
		.toLocaleLowerCase()
		.replace(/[áàâäãå]/g, "a")
		.replace(/[ç]/g, "c")
		.replace(/[éèêë]/g, "e")
		.replace(/[íìîï]/g, "i")
		.replace(/ñ/g, "n")
		.replace(/[óòôöõ]/g, "o")
		.replace(/[úùûü]/g, "u")
		.replace(/[ýÿ]/g, "y")
		.replace(/[\W_]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
}

function unique(words: string[]): string {
	return Array.from(new Set(words)).join(" ");
}

/**
 * The searchable text stored in a node's `fulltext`: lower case, without accents or punctuation,
 * without short words and without repeated words.
 */
export function fulltextOf(texts: string[]): string {
	return unique(
		normalizedWords(texts.join(" ")).filter((word) => word.length >= MIN_WORD_LENGTH),
	);
}

/**
 * Cleans a `fulltext match` query the same way as the stored text, so both sides compare equal.
 * A query made only of short words keeps them, so they still match the start or middle of a
 * longer stored word. A query with no words at all is returned unchanged.
 */
export function fulltextQuery(query: string): string {
	const words = normalizedWords(query);
	if (words.length === 0) return query;

	const long = words.filter((word) => word.length >= MIN_WORD_LENGTH);
	return unique(long.length ? long : words);
}

/** Applies {@link fulltextQuery} to every `fulltext match` filter and leaves the others as they are. */
export function withFulltextQueries(filters: NodeFilters2D): NodeFilters2D {
	return filters.map((group) =>
		group.map((filter): NodeFilter => {
			const [field, operator, value] = filter;
			return field === "fulltext" && operator === "match" && typeof value === "string"
				? [field, operator, fulltextQuery(value)]
				: filter;
		})
	);
}
