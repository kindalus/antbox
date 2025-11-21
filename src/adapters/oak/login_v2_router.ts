import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { logoutHandler, meHandler, rootHandler } from "api/login_handler.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]) {
	const loginRouter = new Router({ prefix: "/login" });

	loginRouter.post("/root", adapt(rootHandler(tenants)));
	loginRouter.post("/logout", adapt(logoutHandler(tenants)));
	loginRouter.get("/me", adapt(meHandler(tenants)));

	return loginRouter;
}
