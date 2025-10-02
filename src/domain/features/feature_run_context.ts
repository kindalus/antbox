import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeService } from "application/node_service.ts";

export interface RunContext {
	authenticationContext: AuthenticationContext;
	nodeService: NodeService;
}
