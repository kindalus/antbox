import { Context } from "../../../deps.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export function getTenantByContext(ctx: Context, tenants: AntboxTenant[]) {
	const tenant = ctx.request.headers.get("x-tenant") ?? tenants[0].name;

	return tenants.find((t) => t.name === tenant) ?? tenants[0];
}

export function getTenantBySearchParams(name: string, tenants: AntboxTenant[]) {
	const tenant = tenants.find((tenant) => tenant.name === name);

	return tenant ?? tenants[0];
}
