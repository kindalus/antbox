import { Router } from "@oakserver/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
  copyHandler,
  createHandler,
  deleteHandler,
  duplicateHandler,
  evaluateHandler,
  exportHandler,
  findHandler,
  getHandler,
  listHandler,
  // recognizeHandler,
  updateHandler,
} from "api/nodes_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
  const router = new Router({ prefix: "/nodes" });

  router.get("/", adapt(listHandler(tenants)));
  router.post("/", adapt(createHandler(tenants)));
  router.get("/:uuid", adapt(getHandler(tenants)));
  router.patch("/:uuid", adapt(updateHandler(tenants)));
  router.delete("/:uuid", adapt(deleteHandler(tenants)));
  router.post("/:uuid/-/copy", adapt(copyHandler(tenants)));
  router.get("/:uuid/-/duplicate", adapt(duplicateHandler(tenants)));
  router.post("/-/query", adapt(findHandler(tenants)));
  router.get("/:uuid/-/export", adapt(exportHandler(tenants)));
  router.get("/:uuid/-/evaluate", adapt(evaluateHandler(tenants)));
  router.post("/-/find", adapt(findHandler(tenants)));
  // router.get("/:uuid/-/ocr", adapt(recognizeHandler(tenants)));

  return router;
}
