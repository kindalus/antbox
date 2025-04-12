import type { ActionService } from "application/action_service.ts";
import type { ApiKeyService } from "application/api_key_service.ts";
import type { AspectService } from "application/aspect_service.ts";
import type { AuthService } from "application/auth_service.ts";
import type { ExtService } from "application/ext_service.ts";
import { NodeService } from "application/node_service.ts";

export interface AntboxTenant {
  name: string;
  rootPasswd: string;
  rawJwk: Record<string, string>;
  symmetricKey: string;
  nodeService: NodeService;
  aspectService: AspectService;
  actionService: ActionService;
  authService: AuthService;
  extService: ExtService;
  apiKeyService: ApiKeyService;
}
