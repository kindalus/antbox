export interface ServerConfiguration {
  port?: number;
  engine?: string;
  tenants: TenantConfiguration[];
}

export type ModuleConfiguration = [modulePath: string, ...params: string[]];

export interface TenantConfiguration {
  name: string;
  rootPasswd?: string;
  key?: string;
  jwk?: string;
  storage?: ModuleConfiguration;
  repository?: ModuleConfiguration;
}
