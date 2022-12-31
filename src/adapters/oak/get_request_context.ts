import { Context } from "/deps/oak";
import { OakAuthRequestProvider } from "./oak_auth_request_provider.ts";

export function getRequestContext(ctx: Context) {
  return new OakAuthRequestProvider(ctx);
}
