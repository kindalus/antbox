import { type AntboxTenant } from "./setup_oak_server.ts";

export function getTenantByHeaders(ctx: Context, tenants: AntboxTenant[]) {
  const tenant = ctx.request.headers.get("x-tenant") ?? tenants[0].name;

  return tenants.find((t) => t.name === tenant);
}

export function getTenantBySearchParams(ctx: Context, tenants: AntboxTenant[]) {
  const params = getQuery(ctx);
  const tenant = params["x-tenant"];

  if (!tenant || tenant.length === 0) {
    return undefined;
  }

  return tenants.find((t) => t.name === tenant);
}

export function getTenant(ctx: Context, tenants: AntboxTenant[]) {
  const tenant =
    getTenantBySearchParams(ctx, tenants) ??
    getTenantByHeaders(ctx, tenants) ??
    tenants[0];

  return tenant;
}
