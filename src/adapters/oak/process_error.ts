import { EcmError } from "/shared/ecm_error.ts";
import { ValidationError } from "../../domain/nodes/validation_error.ts";
import { Context } from "/deps/oak";
import {
  sendBadRequest,
  sendInternalServerError,
  sendNotFound,
} from "./send_response.ts";

export function processError(
  error: EcmError | ValidationError[],
  ctx: Context
) {
  if ((error as ValidationError[]).length) {
    return sendBadRequest(ctx, error);
  }

  const { errorCode, message } = error as EcmError;

  if (errorCode === "NodeNotFoundError") {
    return sendNotFound(ctx, message);
  }

  sendInternalServerError(ctx, message);

  console.error(error);
}
