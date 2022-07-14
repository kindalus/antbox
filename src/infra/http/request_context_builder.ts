import { OpineRequest } from "/deps/opine";
import { RequestContext } from "/application/request_context.ts";

export function getRequestContext(_req: OpineRequest): RequestContext {
	return {
		getUserId: () => "System",
	};
}
