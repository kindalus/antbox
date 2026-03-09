import { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeServiceProxy } from "application/nodes/node_service_proxy.ts";
import { Logger } from "shared/logger.ts";

export interface RunContext {
	authenticationContext: AuthenticationContext;
	nodeService: NodeServiceProxy;
	logger: Logger;
}
