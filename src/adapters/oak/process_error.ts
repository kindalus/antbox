import { AntboxError } from "/shared/antbox_error.ts";
import { ValidationError } from "../../domain/nodes/validation_error.ts";
import { Context } from "/deps/oak";
import {
  sendBadRequest,
  sendInternalServerError,
  sendNotFound,
} from "./send_response.ts";

export function processError(
  error: AntboxError | ValidationError[] | Error,
  ctx: Context
) {
  if ((error as ValidationError[]).length) {
    return sendBadRequest(ctx, error);
  }

  const { errorCode, message } = error as AntboxError;

  if (errorCode === "NodeNotFoundError") {
    return sendNotFound(ctx, message);
  }

  sendInternalServerError(ctx, message);

  console.error(error);
}
