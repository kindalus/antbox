import type { ApiKeyService } from "application/api_key_service.ts";
import type { AspectService } from "application/aspect_service.ts";
import type { AuthService } from "application/auth_service.ts";
import type { SkillService } from "application/skill_service.ts";
import { NodeService } from "application/node_service.ts";

export interface AntboxTenant {
  name: string;
  rootPasswd: string;
  rawJwk: Record<string, string>;
  symmetricKey: string;
  nodeService: NodeService;
  aspectService: AspectService;
  skillService: SkillService;
  authService: AuthService;
  apiKeyService: ApiKeyService;
}
