import type { TokenUsage } from "domain/ai/chat_message.ts";

/**
 * Tokens that count towards the monthly quota: new input, cache writes and output.
 *
 * Cache reads are excluded so re-sending the same context on every model call does not
 * inflate the quota. It is derived from the prompt and completion split because providers
 * disagree on whether their reported total includes cache tokens. Events recorded before
 * the cache breakdown existed count in full.
 */
export function quotaTokens(usage: Partial<TokenUsage> | undefined): number {
	if (!usage) return 0;
	const { promptTokens, completionTokens, totalTokens, cacheReadTokens = 0 } = usage;
	if (promptTokens === undefined && completionTokens === undefined) return totalTokens ?? 0;
	return (promptTokens ?? 0) + (completionTokens ?? 0) - cacheReadTokens;
}
