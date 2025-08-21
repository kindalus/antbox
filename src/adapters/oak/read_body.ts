import type { Context } from "@oak/oak";

export async function readBody(ctx: Context): Promise<BodyInit | null> {
  const contentType = ctx.request.headers.get("Content-Type");

  if (contentType?.includes("text/plain")) {
    return await ctx.request.body.text();
  }

  if (contentType?.includes("application/json")) {
    const body = await ctx.request.body.json();
    return JSON.stringify(body);
  }

  if (contentType?.includes("application/x-www-form-urlencoded")) {
    const body = await ctx.request.body.form();
    const formData = new FormData();
    for (const [key, value] of Object.entries(body)) {
      formData.append(key, String(value));
    }
    return formData;
  }

  if (contentType?.includes("multipart/form-data")) {
    const body = await ctx.request.body.formData();
    return body as BodyInit;
  }

  return null;
}
