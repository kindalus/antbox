import { type AntboxTenant } from "api/antbox_tenant.ts";
import { rootHandler } from "api/login_handler.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
  const router = createRouter();

  router.post("/root", adapt(rootHandler(tenants)));

  return router;
}
