import type { AuthenticationContext } from "application/authentication_context.ts";
import { type AntboxTenant } from "./antbox_tenant.ts";
import { getQuery } from "./get_query.ts";

export function getTenantByHeaders(req: Request, tenants: AntboxTenant[]) {
  const tenant = req.headers.get("X-Tenant") ?? tenants[0].name;
  return tenants.find((t) => t.name === tenant);
}

export function getTenantBySearchParams(req: Request, tenants: AntboxTenant[]) {
  const params = getQuery(req);
  const tenant = params["x-tenant"];

  if (!tenant || tenant.length === 0) {
    return undefined;
  }

  return tenants.find((t) => t.name === tenant);
}

export function getTenant(req: Request, tenants: AntboxTenant[]) {
  const tenant =
    getTenantBySearchParams(req, tenants) ?? getTenantByHeaders(req, tenants) ?? tenants[0];

  return tenant;
}

export function getTenantByAuthContext(ctx: AuthenticationContext, tenants: AntboxTenant[]) {
  const tenant = tenants.find((t) => t.name === ctx.tenant) ?? tenants[0];

  return tenant;
}
