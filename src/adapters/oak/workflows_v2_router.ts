import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createOrReplaceWorkflowDefinitionHandler,
	deleteWorkflowDefinitionHandler,
	exportWorkflowDefinitionHandler,
	findActiveWorkflowsHandler,
	getWorkflowDefinitionHandler,
	getWorkflowInstanceHandler,
	listWorkflowDefinitionsHandler,
	startWorkflowHandler,
	transitionWorkflowHandler,
} from "api/workflow_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/workflows" });

	// Workflow instance operations
	router.get("/instances", adapt(findActiveWorkflowsHandler(tenants)));
	router.post("/instances/:uuid/-/start", adapt(startWorkflowHandler(tenants)));
	router.post("/instances/:uuid/-/transition", adapt(transitionWorkflowHandler(tenants)));
	router.get("/instances/:uuid", adapt(getWorkflowInstanceHandler(tenants)));

	// Workflow definition CRUD operations
	router.get("/definitions", adapt(listWorkflowDefinitionsHandler(tenants)));
	router.post("/definitions", adapt(createOrReplaceWorkflowDefinitionHandler(tenants)));
	router.get("/definitions/:uuid", adapt(getWorkflowDefinitionHandler(tenants)));
	router.delete("/definitions/:uuid", adapt(deleteWorkflowDefinitionHandler(tenants)));
	router.get("/definitions/:uuid/-/export", adapt(exportWorkflowDefinitionHandler(tenants)));

	return router;
}
