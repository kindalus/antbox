import { type AntboxTenant } from "api/antbox_tenant.ts";
import {
  createOrReplaceHandler,
  deleteHandler,
  exportHandler,
  getHandler,
  listHandler,
} from "api/aspects_handlers.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
  const router = createRouter();

  router.get("/", adapt(listHandler(tenants)));
  router.get("/:uuid", adapt(getHandler(tenants)));
  router.delete("/:uuid", adapt(deleteHandler(tenants)));
  router.get("/:uuid/-/export", adapt(exportHandler(tenants)));
  router.post("/", adapt(createOrReplaceHandler(tenants)));

  return router;
}
