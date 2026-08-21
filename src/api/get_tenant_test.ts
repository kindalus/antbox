import { describe, it } from "bdd";
import { expect } from "expect";
import type { AntboxTenant } from "./antbox_tenant.ts";
import { resolveTenant } from "./get_tenant.ts";

function tenant(name: string): AntboxTenant {
	return { name } as AntboxTenant;
}

describe("resolveTenant", () => {
	it("selects a tenant named default even when it is not first", () => {
		const tenants = [tenant("company"), tenant("default")];
		const request = new Request("http://localhost", { headers: { "X-Tenant": "default" } });

		expect(resolveTenant(request, tenants)).toBe(tenants[1]);
	});

	it("keeps default as an alias for the first tenant when no tenant has that name", () => {
		const tenants = [tenant("company"), tenant("other")];
		const request = new Request("http://localhost", { headers: { "X-Tenant": "default" } });

		expect(resolveTenant(request, tenants)).toBe(tenants[0]);
	});
});
