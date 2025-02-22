import { type AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";

export interface RunContext {
  readonly nodeService: NodeService;
  readonly authenticationContext: AuthenticationContext;
}
