/** How much the threshold drops, once, when no result passes it. */
const RELAXATION = 0.1;

/** The threshold minus 10 percentage points, rounded to avoid 0.4999…, never below zero. */
export function relaxedThreshold(threshold: number): number {
	return Math.max(0, Math.round((threshold - RELAXATION) * 1000) / 1000);
}

/**
 * Keeps the results above the provider threshold. When none passes it, keeps the ones above the
 * threshold lowered by 10 points; when none passes that either, keeps nothing.
 *
 * The decision depends only on the best score, so every page of a search uses the same threshold.
 *
 * @param sorted Results ordered by score, best first.
 */
export function applyRelevanceThreshold<T extends { score: number }>(
	sorted: T[],
	threshold: number,
): { results: T[]; threshold: number } {
	const best = sorted[0]?.score;
	if (best === undefined) return { results: [], threshold };

	const applied = best >= threshold ? threshold : relaxedThreshold(threshold);
	if (best < applied) return { results: [], threshold: applied };

	return { results: sorted.filter((result) => result.score >= applied), threshold: applied };
}
