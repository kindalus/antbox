import { Router } from "@oakserver/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { rootHandler } from "api/login_handler.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]) {
  const loginRouter = new Router({ prefix: "/login" });

  loginRouter.post("/root", adapt(rootHandler(tenants)));

  return loginRouter;
}
