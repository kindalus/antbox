import type { NodeFilter } from "./node_filter.ts";

/** Words shorter than this are left out of the in-memory search text. */
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
 * The in-memory search text: lower case, without accents or punctuation, without short words and
 * without repeated words.
 */
export function fulltextOf(texts: string[]): string {
	return unique(
		normalizedWords(texts.join(" ")).filter((word) => word.length >= MIN_WORD_LENGTH),
	);
}

/**
 * Cleans an in-memory `fulltext match` query the same way as the search text, so both sides
 * compare equal. A query made only of short words keeps them, so they still match the start or
 * middle of a longer word. A query with no words at all is returned unchanged.
 */
export function fulltextQuery(query: string): string {
	const words = normalizedWords(query);
	if (words.length === 0) return query;

	const long = words.filter((word) => word.length >= MIN_WORD_LENGTH);
	return unique(long.length ? long : words);
}

/**
 * In-memory full-text match: the cleaned query words must appear, in order, inside the cleaned
 * text. A query without words matches nothing.
 */
export function fulltextMatches(query: string, texts: string[]): boolean {
	if (normalizedWords(query).length === 0) return false;

	const text = fulltextOf(texts);
	let start = 0;
	for (const term of fulltextQuery(query).split(" ")) {
		const index = text.indexOf(term, start);
		if (index < 0) return false;
		start = index + term.length;
	}
	return true;
}

/** True when the filter is a full-text search, which repositories run with fts(). */
export function isFulltextFilter([field, operator]: NodeFilter): boolean {
	return field === "fulltext" && operator === "match";
}

/**
 * The query words for a native full-text engine: runs of letters, numbers and combining marks.
 * Everything else, including every search operator, separates words and is dropped.
 */
export function fulltextTerms(query: string): string[] {
	return query.split(/[^\p{L}\p{N}\p{M}]+/u).filter((term) => /[\p{L}\p{N}]/u.test(term));
}
