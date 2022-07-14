import Principal from "../../domain/auth/principal.ts";
import { OpineRequest } from "/deps/opine";

export function getRequestContext(_req: OpineRequest): Principal {
	return {
		getPrincipalName: () => "System",
	};
}
