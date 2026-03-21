import type { StorageLimit, TokenLimit } from "./tenant_limits.ts";

export interface TokenUsageMetrics {
	year: number;
	month: number;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	limitMillions: TokenLimit;
}

export interface StorageUsageMetrics {
	totalGb: number;
	limitGb: StorageLimit;
}
