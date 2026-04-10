import { z } from "zod";
import type { TenantLimits } from "domain/metrics/tenant_limits.ts";

export const ModuleConfigurationSchema = z.tuple([z.string()]).rest(z.string());

export const StorageLimitSchema = z.union([
	z.number().nonnegative(),
	z.literal("pay-as-you-go"),
]);

export const TokenLimitSchema = z.union([
	z.number().int().nonnegative(),
	z.literal("pay-as-you-go"),
]);

export const TenantLimitsSchema = z.object({
	storage: StorageLimitSchema,
	tokens: TokenLimitSchema,
});

export const AIConfigurationSchema = z.object({
	enabled: z.boolean(),
	defaultModel: z.string().min(1),
	embeddingProvider: ModuleConfigurationSchema.optional(),
	ocrProvider: ModuleConfigurationSchema.optional(),
	skillsPath: z.string().optional(),
});

const OptionalNonEmptyStringSchema = z.string().trim().min(1).optional();

export const TenantConfigurationSchema = z.object({
	name: z.string().min(1),
	rootPasswd: z.string().optional(),
	key: OptionalNonEmptyStringSchema,
	jwks: OptionalNonEmptyStringSchema,
	storage: ModuleConfigurationSchema,
	repository: ModuleConfigurationSchema,
	configurationRepository: ModuleConfigurationSchema,
	eventStoreRepository: ModuleConfigurationSchema,
	ai: AIConfigurationSchema.optional(),
	limits: TenantLimitsSchema,
}).superRefine((value, ctx) => {
	const aiEnabled = value.ai?.enabled === true;

	if (!aiEnabled && value.limits.tokens !== 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["limits", "tokens"],
			message: "tokens limit must be 0 when AI is disabled",
		});
	}

	if (
		aiEnabled &&
		value.limits.tokens !== "pay-as-you-go" &&
		value.limits.tokens <= 0
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["limits", "tokens"],
			message: "tokens limit must be greater than 0 when AI is enabled",
		});
	}
});

export const TenantsConfigurationSchema = z.array(TenantConfigurationSchema).min(1);

export interface ServerConfiguration {
	port?: number;
	engine?: string;
	logLevel?: string;
	rootPasswd?: string;
	key?: string;
	jwks?: string;
	tenants: TenantConfiguration[];
}

export type ModuleConfiguration = [modulePath: string, ...params: string[]];

export interface AIConfiguration {
	enabled: boolean;
	/** ADK model string, e.g. "google/gemini-2.5-flash" */
	defaultModel: string;
	/** Module configuration for EmbeddingsProvider adapter */
	embeddingProvider?: ModuleConfiguration;
	/** Module configuration for OCRProvider adapter */
	ocrProvider?: ModuleConfiguration;
	/** Path to extra skills directory (in addition to builtin skills) */
	skillsPath?: string;
}

export interface TenantConfiguration {
	name: string;
	rootPasswd?: string;
	key?: string;
	jwks?: string;
	storage: ModuleConfiguration;
	repository: ModuleConfiguration;
	configurationRepository: ModuleConfiguration;
	eventStoreRepository: ModuleConfiguration;
	ai?: AIConfiguration;
	limits: TenantLimits;
}
