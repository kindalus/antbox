import { Router } from "@oak/oak";
import {
  deleteHandler,
  exportHandler,
  getHandler,
  listHandler,
  runHandler,
} from "api/actions_handlers.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]) {
  const actionsRouter = new Router({ prefix: "/actions" });

  actionsRouter.get("/:uuid", adapt(getHandler(tenants)));
  actionsRouter.delete("/:uuid", adapt(deleteHandler(tenants)));
  actionsRouter.get("/:uuid/-/export", adapt(exportHandler(tenants)));
  actionsRouter.get("/", adapt(listHandler(tenants)));
  actionsRouter.get("/:uuid/-/run", adapt(runHandler(tenants)));

  return actionsRouter;
}
