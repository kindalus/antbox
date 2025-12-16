import { AuthenticationContext } from "application/authentication_context.ts";
import { NodeServiceProxy } from "application/node_service_proxy.ts";

export interface RunContext {
	authenticationContext: AuthenticationContext;
	nodeService: NodeServiceProxy;
}
