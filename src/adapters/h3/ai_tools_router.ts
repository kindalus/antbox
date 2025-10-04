import { type AntboxTenant } from "api/antbox_tenant.ts";
import { listAIToolsHandler, runAIToolHandler } from "api/ai_tools_handlers.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = createRouter();

	// AI Tools operations
	router.get("/", adapt(listAIToolsHandler(tenants)));
	router.post("/:uuid/run", adapt(runAIToolHandler(tenants)));

	return router;
}
