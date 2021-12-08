import { OpineResponse } from "../deps.ts";

// deno-lint-ignore no-explicit-any
export default function processError(error: any, res: OpineResponse) {
  if (error.errorCode && error.errorCode === "NodeNotFoundError") {
    res.setStatus(404);
  } else {
    res.setStatus(500);
    console.error(error);
  }
  res.end(error.message ?? "");
}
