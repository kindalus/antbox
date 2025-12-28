import { AuthenticationContext } from "application/security/authentication_context.ts";
import { NodeServiceProxy } from "application/nodes/node_service_proxy.ts";

export interface RunContext {
	authenticationContext: AuthenticationContext;
	nodeService: NodeServiceProxy;
}
