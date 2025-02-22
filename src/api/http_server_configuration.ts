export interface ServerConfiguration {
  port?: number;
  ocrEngine: ModuleConfiguration;
  tenants: TenantConfiguration[];
}

export type ModuleConfiguration = [modulePath: string, ...params: string[]];

export interface TenantConfiguration {
  name: string;
  rootPasswd?: string;
  symmetricKey?: string;
  jwkPath?: string;
  storage?: ModuleConfiguration;
  repository?: ModuleConfiguration;
}
