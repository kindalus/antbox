import { AntboxError } from "/shared/antbox_error.ts";
import { OpineResponse } from "/deps/opine";
import { ValidationError } from "../../domain/nodes/validation_error.ts";

export function processError(
  error: AntboxError | ValidationError[],
  res: OpineResponse
) {
  if ((error as ValidationError[]).length) {
    res.setStatus(400).json(error);
    res.end();

    return;
  }

  const AntboxError = error as AntboxError;

  if (AntboxError.errorCode && AntboxError.errorCode === "NodeNotFoundError") {
    res.setStatus(404);
  } else {
    res.setStatus(500).json(AntboxError);
    console.error(error);
  }
  res.end(AntboxError.message ?? "");
}
