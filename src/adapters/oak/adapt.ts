import type { Context } from "@oakserver/oak";
import { type HttpHandler } from "api/handler.ts";

async function readBody(ctx: Context) {
  const contentType = ctx.request.headers.get("Content-Type");

  if (contentType?.includes("text/plain")) {
    return await ctx.request.body.text();
  } else if (contentType?.includes("application/json")) {
    return await ctx.request.body.json();
  }

  return ctx.request.body;
}

export function adapt(handler: HttpHandler): (ctx: Context) => Promise<void> {
  return async (ctx: Context) => {
    const init: RequestInit = {
      headers: ctx.request.headers,
      method: ctx.request.method,
      body: await readBody(ctx),
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
