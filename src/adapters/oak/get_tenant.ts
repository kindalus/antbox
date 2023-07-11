import { Context } from "../../../deps.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export function getTenant(ctx: Context, tenants: AntboxTenant[]) {
  const tenantName = ctx.request.headers.get("x-tenant") ?? tenants[0].name;

  return tenants.find((t) => t.name === tenantName) ?? tenants[0];
}
