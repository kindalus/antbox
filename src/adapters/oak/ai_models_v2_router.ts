import { Router } from "@oak/oak";
import { listAIModelsHandler } from "api/agents_handlers.ts";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/ai-models" });

	// CRUD operations
	router.get("/", adapt(listAIModelsHandler(tenants)));

	return router;
}
