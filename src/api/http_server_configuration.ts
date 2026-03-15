import { z } from "zod";

export const ModuleConfigurationSchema = z.tuple([z.string()]).rest(z.string());

export const AIConfigurationSchema = z.object({
	enabled: z.boolean(),
	defaultModel: z.string().min(1),
	embeddingProvider: ModuleConfigurationSchema.optional(),
	ocrProvider: ModuleConfigurationSchema.optional(),
	skillsPath: z.string().optional(),
});

export const TenantConfigurationSchema = z.object({
	name: z.string().min(1),
	rootPasswd: z.string().optional(),
	key: z.string().optional(),
	jwks: z.string().optional(),
	storage: ModuleConfigurationSchema,
	repository: ModuleConfigurationSchema,
	configurationRepository: ModuleConfigurationSchema,
	eventStoreRepository: ModuleConfigurationSchema,
	ai: AIConfigurationSchema.optional(),
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
}
