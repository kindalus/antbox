import { OpineResponse } from "/deps/opine";

// deno-lint-ignore no-explicit-any
export function processError(error: any, res: OpineResponse) {
  if (error.errorCode && error.errorCode === "NodeNotFoundError") {
    res.setStatus(404);
  } else {
    res.setStatus(500);
    console.error(error);
  }
  res.end(error.message ?? "");
}
