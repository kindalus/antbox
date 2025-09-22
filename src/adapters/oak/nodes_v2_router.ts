import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
  copyHandler,
  createFileHandler,
  createHandler,
  deleteHandler,
  duplicateHandler,
  evaluateHandler,
  exportHandler,
  findHandler,
  getHandler,
  listHandler,
  updateFileHandler,
  updateHandler,
} from "api/nodes_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
  const router = new Router({ prefix: "/nodes" });

  // Core node operations
  router.get("/", adapt(listHandler(tenants)));
  router.post("/", adapt(createHandler(tenants)));
  router.post("/-/upload", adapt(createFileHandler(tenants)));

  router.get("/:uuid", adapt(getHandler(tenants)));
  router.patch("/:uuid", adapt(updateHandler(tenants)));
  router.delete("/:uuid", adapt(deleteHandler(tenants)));
  router.put("/:uuid/-/upload", adapt(updateFileHandler(tenants)));

  // Node operations
  router.post("/:uuid/-/copy", adapt(copyHandler(tenants)));
  router.get("/:uuid/-/duplicate", adapt(duplicateHandler(tenants)));
  router.get("/:uuid/-/export", adapt(exportHandler(tenants)));
  router.get("/:uuid/-/evaluate", adapt(evaluateHandler(tenants)));

  // Search operations
  router.post("/-/find", adapt(findHandler(tenants)));

  return router;
}
