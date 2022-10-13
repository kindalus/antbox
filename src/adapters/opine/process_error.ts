import { EcmError } from "/shared/ecm_error.ts";
import { OpineResponse } from "/deps/opine";

export function processError(error: EcmError, res: OpineResponse) {
  if (error.errorCode && error.errorCode === "NodeNotFoundError") {
    res.setStatus(404);
  } else {
    res.setStatus(500);
    console.error(error);
  }
  res.end(error.message ?? "");
}
