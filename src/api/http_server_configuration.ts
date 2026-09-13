import { z } from "zod";
import { type ModelSelection, ModelSelectionSchema } from "domain/ai/model_selection.ts";
import type { TenantLimits } from "domain/metrics/tenant_limits.ts";

export const ModuleConfigurationSchema = z.tuple([z.string()]).rest(z.string());

export const TenantNameSchema = z.string().regex(
	/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
	"must contain only lowercase letters, numbers, and internal hyphens",
);

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
	defaultModel: ModelSelectionSchema,
	embeddingProvider: ModuleConfigurationSchema.optional(),
	ocrProvider: ModuleConfigurationSchema.optional(),
	skillsPath: z.string().optional(),
	modelsPath: z.string().trim().min(1).optional(),
	sessionsPath: z.string().trim().min(1).optional(),
});

const OptionalNonEmptyStringSchema = z.string().trim().min(1).optional();

export const DEFAULT_MCP_MAX_REQUEST_BODY_BYTES = 1048576;

export const McpAllowedOriginsSchema = z.array(z.string().trim().min(1));

export const McpMaxRequestBodyBytesSchema = z.number().int().positive();

export const McpHttpConfigurationSchema = z.object({
	mcpAllowedOrigins: McpAllowedOriginsSchema.optional(),
	mcpMaxRequestBodyBytes: McpMaxRequestBodyBytesSchema.optional(),
});

/** Resolved MCP HTTP boundary settings. */
export interface McpHttpOptions {
	/** Exact Origin allowlist. Empty means browser requests are rejected. */
	allowedOrigins?: string[];
	/** Maximum accepted request body size in bytes. */
	maxRequestBodyBytes?: number;
}

export const TenantConfigurationSchema = z.object({
	name: TenantNameSchema,
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

export const TenantsConfigurationSchema = z.array(TenantConfigurationSchema).min(1).superRefine(
	(tenants, ctx) => {
		const names = new Set<string>();
		for (const [index, tenant] of tenants.entries()) {
			if (names.has(tenant.name)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: [index, "name"],
					message: `duplicate tenant name: ${tenant.name}`,
				});
			}
			names.add(tenant.name);
		}
	},
);

export interface ServerConfiguration {
	port?: number;
	engine?: string;
	logLevel?: string;
	rootPasswd?: string;
	key?: string;
	jwks?: string;
	tenants: TenantConfiguration[];
	/** Exact Origin allowlist for the MCP endpoint. Defaults to no allowed origins. */
	mcpAllowedOrigins?: string[];
	/** Maximum accepted MCP request body size in bytes. Defaults to 1048576. */
	mcpMaxRequestBodyBytes?: number;
	/** Derived at load time; not read from config.toml. Null means no administrative tenant. */
	adminTenantName?: string | null;
}

export type ModuleConfiguration = [modulePath: string, ...params: string[]];

export interface AIConfiguration {
	enabled: boolean;
	/** Pi model selection, e.g. ["google/gemini-2.5-flash", "medium"] */
	defaultModel: ModelSelection;
	/** Module configuration for EmbeddingsProvider adapter */
	embeddingProvider?: ModuleConfiguration;
	/** Module configuration for OCRProvider adapter */
	ocrProvider?: ModuleConfiguration;
	/** Path to extra skills directory (in addition to builtin skills) */
	skillsPath?: string;
	/** Optional Pi models.json for custom providers and models. */
	modelsPath?: string;
	/** Directory for persisted Pi sessions; relative paths resolve against dataDir. */
	sessionsPath?: string;
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
