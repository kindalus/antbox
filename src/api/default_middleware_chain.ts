import { type AntboxTenant } from "./antbox_tenant.ts";
import { authenticationMiddleware } from "./authentication_middleware.ts";
import { type HttpHandler } from "./handler.ts";
import { chain, corsMiddleware, logMiddleware } from "./middleware.ts";

export function defaultMiddlewareChain(
  tenants: AntboxTenant[],
  h: HttpHandler,
): HttpHandler {
  return chain(
    h,
    authenticationMiddleware(tenants),
    corsMiddleware,
    logMiddleware,
  );
}
