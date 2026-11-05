import type { StorageLimit, TokenLimit } from "./tenant_limits.ts";

export interface SourceTokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
}

export interface TokenUsageMetrics {
	year: number;
	month: number;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	/** The value compared with the quota: agent usage without cache reads. */
	quotaTokens: number;
	limitMillions: TokenLimit;
	agents: SourceTokenUsage;
	embeddings: SourceTokenUsage;
	ocr: SourceTokenUsage;
}

export interface StorageUsageMetrics {
	totalGb: number;
	limitGb: StorageLimit;
}
