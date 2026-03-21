export type StorageLimit = number | "pay-as-you-go";

export type TokenLimit = number | "pay-as-you-go";

export interface TenantLimits {
	storage: StorageLimit;
	tokens: TokenLimit;
}
