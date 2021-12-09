import { OpineRequest } from "../../deps.ts";
import { RequestContext } from "../ecm/request_context.ts";

export function getRequestContext(_req: OpineRequest): RequestContext {
	return {
		getUserId: () => "System",
	};
}
