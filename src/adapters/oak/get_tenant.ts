import { Context } from "../../../deps.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export function getTenantByHeaders(ctx: Context, tenants: AntboxTenant[]) {
	const tenant = ctx.request.headers.get("x-tenant") ?? tenants[0].name;

	return tenants.find((t) => t.name === tenant) ?? tenants[0];
}

export function getTenantBySearchParams(ctx: Context, tenants: AntboxTenant[]) {
	const tenantName = ctx.request.url.searchParams.get("x-tenant") || "";
	const tenant = tenants.find((tenant) => tenant.name === tenantName);

	return tenant ?? tenants[0];
}
