import { Router } from "@oak/oak";
import {
  deleteHandler,
  exportHandler,
  getHandler,
  listActionsHandler,
  listExtsHandler,
  listHandler,
  listMcpToolsHandler,
  runActionHandler,
  runExtHandler,
  runMcpToolHandler,
} from "api/skills_handlers.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]) {
  const skillsRouter = new Router({ prefix: "/skills" });

  // List operations
  skillsRouter.get("/", adapt(listHandler(tenants))); // List all skills
  skillsRouter.get("/-/actions", adapt(listActionsHandler(tenants))); // List action-exposed skills
  skillsRouter.get("/-/extensions", adapt(listExtsHandler(tenants))); // List extension-exposed skills
  skillsRouter.get("/-/mcp-tools", adapt(listMcpToolsHandler(tenants))); // List MCP-exposed skills

  // Core skill operations
  skillsRouter.get("/:uuid", adapt(getHandler(tenants)));
  skillsRouter.delete("/:uuid", adapt(deleteHandler(tenants)));
  skillsRouter.get("/:uuid/-/export", adapt(exportHandler(tenants)));

  // Run operations
  skillsRouter.get("/:uuid/-/run-action", adapt(runActionHandler(tenants))); // Run as action
  skillsRouter.get("/:uuid/-/run-ext", adapt(runExtHandler(tenants))); // Run as extension (GET)
  skillsRouter.post("/:uuid/-/run-ext", adapt(runExtHandler(tenants))); // Run as extension (POST)
  skillsRouter.post("/:uuid/-/run-mcp", adapt(runMcpToolHandler(tenants))); // Run as MCP tool

  return skillsRouter;
}
