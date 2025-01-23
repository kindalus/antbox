import { AntboxService } from "../application/antbox_service.ts";

export interface AntboxTenant {
	name: string;
	service: AntboxService;
	rootPasswd: string;
	rawJwk: Record<string, string>;
	symmetricKey: string;
}
