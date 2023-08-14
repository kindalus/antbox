import { NodeService } from "../../application/node_service.ts";
import { AuthContextProvider } from "../auth/auth_provider.ts";

export interface RunContext {
	readonly nodeService: NodeService;
	readonly authContext: AuthContextProvider;
}
