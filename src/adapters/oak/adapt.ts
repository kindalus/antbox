import { Context } from "deps.ts";
import { HttpHandler } from "api/handler.ts";

export function adapt(handler: HttpHandler): (ctx: Context) => Promise<void> {
  return async (ctx: Context) => {
    const init: RequestInit = {
      headers: ctx.request.headers,
      method: ctx.request.method,
    };

    const req = new Request(ctx.request.url, init);

    const res = await handler(req);

    ctx.response.status = res.status;
    ctx.response.body = res.body;
    if (res.headers.get("Content-Type") === "application/json") {
      ctx.response.type = "json";
    }
  };
}
