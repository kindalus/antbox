import { Context, ResponseBody, Status } from "deps.ts";

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

export function sendForbidden(ctx: Context, body?: ResponseBody) {
  sendResponse(ctx, Status.Forbidden, body);
}

export function sendUnauthorized(ctx: Context) {
  sendResponse(ctx, Status.Unauthorized);
}

export function sendConflict(ctx: Context, body?: ResponseBody) {
  sendResponse(ctx, Status.Conflict, body);
}

function sendResponse(ctx: Context, status: Status, body?: ResponseBody) {
  ctx.response.status = status;
  if (body) {
    ctx.response.type = "json";
    ctx.response.body = body;
  }
}
