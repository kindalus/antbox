import type { Context } from "@oak/oak";
import { type HttpHandler } from "api/handler.ts";

export function adapt(handler: HttpHandler): (ctx: Context) => Promise<void> {
	return async (ctx: Context) => {
		const body = await ctx.request.body.init();

		const headers = new Headers();
		for (const [key, value] of ctx.request.headers.entries()) {
			headers.set(key, value);
		}
		headers.set(
			"x-params",
			JSON.stringify(
				(ctx as Context & { params: Record<string, string> }).params,
			),
		);

		const init: RequestInit = {
			headers,
			method: ctx.request.method,
			body,
		};

		const req = new Request(ctx.request.url, init);

		const res = await handler(req);

		ctx.response.status = res.status;
		ctx.response.body = res.body;

		// Copy all response headers
		for (const [key, value] of res.headers.entries()) {
			ctx.response.headers.set(key, value);
		}

		// Set content type if it's JSON
		if (res.headers.get("Content-Type") === "application/json") {
			ctx.response.type = "json";
		}
	};
}
