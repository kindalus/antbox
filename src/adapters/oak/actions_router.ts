import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { adapt } from "./adapt.ts";
import {
  deleteHandler,
  exportHandler,
  getHandler,
  listActionsHandler,
  runActionHandler,
} from "api/skills_handlers.ts";

export default function (tenants: AntboxTenant[]) {
  const actionsRouter = new Router({ prefix: "/actions" });

  // Backward compatibility: redirect actions endpoints to skills
  actionsRouter.get("/:uuid", adapt(getHandler(tenants)));
  actionsRouter.delete("/:uuid", adapt(deleteHandler(tenants)));
  actionsRouter.get("/:uuid/-/export", adapt(exportHandler(tenants)));
  actionsRouter.get("/", adapt(listActionsHandler(tenants))); // List only action-exposed skills
  actionsRouter.get("/:uuid/-/run", adapt(runActionHandler(tenants)));

  return actionsRouter;
}
