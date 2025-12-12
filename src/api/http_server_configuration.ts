export interface ServerConfiguration {
	port?: number;
	engine?: string;
	tenants: TenantConfiguration[];
}

export type ModuleConfiguration = [modulePath: string, ...params: string[]];

export type ModelConfiguration = [modelPath: string, ...params: string[]];

export interface AIConfiguration {
	enabled: boolean;
	models: ModelConfiguration[];
	defaultModel?: string;
	embeddingModel?: string;
	ocrModel?: string;
	vectorDatabase?: ModuleConfiguration;
}

export interface TenantConfiguration {
	name: string;
	rootPasswd?: string;
	key?: string;
	jwk?: string;
	storage?: ModuleConfiguration;
	repository?: ModuleConfiguration;
	workflowInstanceRepository?: ModuleConfiguration;
	ai?: AIConfiguration;
}
