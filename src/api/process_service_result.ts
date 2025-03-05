import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { sendOK } from "./handler.ts";
import { processError } from "./process_error.ts";

export function processServiceResult<T>(resultOrErr: Either<AntboxError, T>): Response {
  if (resultOrErr.isLeft()) {
    return processError(resultOrErr.value);
  }

  return sendOK(resultOrErr.value);
}
