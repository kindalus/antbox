import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
  createOrReplaceHandler,
  deleteHandler,
  exportHandler,
  getHandler,
  listHandler,
} from "api/aspects_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]) {
  const aspectsRouter = new Router({ prefix: "/aspects" });

  aspectsRouter.get("/", adapt(listHandler(tenants)));
  aspectsRouter.get("/:uuid", adapt(getHandler(tenants)));
  aspectsRouter.delete("/:uuid", adapt(deleteHandler(tenants)));
  aspectsRouter.get("/:uuid/-/export", adapt(exportHandler(tenants)));
  aspectsRouter.post("/", adapt(createOrReplaceHandler(tenants)));

  return aspectsRouter;
}
