import type { Context } from "@oak/oak";
import { type HttpHandler } from "api/handler.ts";
import { readBody } from "./read_body.ts";

export function adapt(handler: HttpHandler): (ctx: Context) => Promise<void> {
  return async (ctx: Context) => {
    const body = await readBody(ctx);

    const headers = new Headers();
    for (const [key, value] of ctx.request.headers.entries()) {
      headers.set(key, value);
    }
    // headers.set("x-params", JSON.stringify(ctx.params));

    const init: RequestInit = {
      headers,
      method: ctx.request.method,
      body,
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
