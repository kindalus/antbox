import { EcmError } from "/shared/ecm_error.ts";
import { OpineResponse } from "/deps/opine";
import { ValidationError } from "../../domain/nodes/validation_error.ts";

export function processError(
  error: EcmError | ValidationError[],
  res: OpineResponse
) {
  if ((error as ValidationError[]).length) {
    res.setStatus(400).json(error);
    res.end();

    return;
  }

  const ecmError = error as EcmError;

  if (ecmError.errorCode && ecmError.errorCode === "NodeNotFoundError") {
    res.setStatus(404);
  } else {
    res.setStatus(500).json(ecmError);
    console.error(error);
  }
  res.end(ecmError.message ?? "");
}
