import { NodeService } from "../application/node_service.ts";

export interface AntboxTenant {
	name: string;
	rootPasswd: string;
	rawJwk: Record<string, string>;
	symmetricKey: string;
	nodeService: NodeService;
}
