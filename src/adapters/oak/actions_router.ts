import { Router } from "@oakserver/oak";
import {
  deleteHandler,
  exportHandler,
  getHandler,
  listHandler,
  runHandler,
} from "api/actions_handlers";
import type { AntboxTenant } from "api/antbox_tenant";
import { adapt } from "./adapt";

export default function (tenants: AntboxTenant[]) {
  const actionsRouter = new Router({ prefix: "/actions" });

  actionsRouter.get("/:uuid", adapt(getHandler(tenants)));
  actionsRouter.delete("/:uuid", adapt(deleteHandler(tenants)));
  actionsRouter.get("/:uuid/-/export", adapt(exportHandler(tenants)));
  actionsRouter.get("/", adapt(listHandler(tenants)));
  actionsRouter.get("/:uuid/-/run", adapt(runHandler(tenants)));

  return actionsRouter;
}
