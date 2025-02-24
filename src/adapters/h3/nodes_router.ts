import { createRouter, type Router } from "h3";
import { type AntboxTenant } from "api/antbox_tenant.ts";

import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
  const router = createRouter();

  router.get("/", adapt(listHandler(tenants)));

  return router;
}
