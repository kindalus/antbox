import { ResponseBody } from "https://deno.land/x/oak@v11.1.0/response.ts";
import { Context, Status } from "/deps/oak";

export function sendOK(ctx: Context, body?: ResponseBody) {
  sendResponse(ctx, Status.OK, body);
}

export function sendNotFound(ctx: Context, body?: ResponseBody) {
  sendResponse(ctx, Status.NotFound, body);
}

export function sendInternalServerError(ctx: Context, body?: ResponseBody) {
  sendResponse(ctx, Status.InternalServerError, body);
}

export function sendBadRequest(ctx: Context, body?: ResponseBody) {
  sendResponse(ctx, Status.BadRequest, body);
}

function sendResponse(ctx: Context, status: Status, body?: ResponseBody) {
  ctx.response.status = status;
  if (body) {
    ctx.response.type = "json";
    ctx.response.body = body;
  }
}
