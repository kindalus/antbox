import { Request } from "express";
import RequestContext from "../ecm/request_context.js";

export function getRequestContext(req: Request): RequestContext {
	return {
		getUserId: () => "System",
	};
}
