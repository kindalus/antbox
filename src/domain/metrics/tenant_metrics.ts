export interface TokenUsageMetrics {
	year: number;
	month: number;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface StorageUsageMetrics {
	totalBytes: number;
}
