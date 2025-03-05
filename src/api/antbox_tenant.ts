import type { ActionService } from "application/action_service";
import type { ApiKeyService } from "application/api_key_service";
import type { AuthService } from "application/auth_service";
import type { ExtService } from "application/ext_service";
import { NodeService } from "application/node_service.ts";

export interface AntboxTenant {
  name: string;
  rootPasswd: string;
  rawJwk: Record<string, string>;
  symmetricKey: string;
  nodeService: NodeService;
  actionService: ActionService;
  authService: AuthService;
  extService: ExtService;
  apiKeyService: ApiKeyService;
}
