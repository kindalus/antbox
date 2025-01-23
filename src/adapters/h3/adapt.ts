import { defineEventHandler, EventHandler, H3Event } from "@h3";
import { HttpHandler } from "../../api/handler.ts";

export function adapt(handler: HttpHandler): EventHandler {
	return defineEventHandler((evt: H3Event): Promise<Response> => {
		const req = evt.web!.request!;

		return handler(req);
	});
}
