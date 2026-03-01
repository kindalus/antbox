export interface ServerConfiguration {
	port?: number;
	engine?: string;
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
	jwk?: string;
	storage?: ModuleConfiguration;
	repository?: ModuleConfiguration;
	configurationRepository?: ModuleConfiguration;
	eventStoreRepository?: ModuleConfiguration;
	ai?: AIConfiguration;
}
