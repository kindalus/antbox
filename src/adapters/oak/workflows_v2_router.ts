import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	cancelWorkflowHandler,
	createOrReplaceWorkflowDefinitionHandler,
	deleteWorkflowDefinitionHandler,
	exportWorkflowDefinitionHandler,
	findActiveWorkflowsHandler,
	getWorkflowDefinitionHandler,
	getWorkflowInstanceHandler,
	listWorkflowDefinitionsHandler,
	startWorkflowHandler,
	transitionWorkflowHandler,
	updateWorkflowNodeFileHandler,
	updateWorkflowNodeHandler,
} from "api/workflow_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the workflows router for the Oak HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = workflowsRouter(tenants);
 * app.use(router.routes(), router.allowedMethods());
 */
export default function (tenants: AntboxTenant[]): Router {
	const router = new Router();

	// Workflow instance operations
	router.get("/workflow-instances", adapt(findActiveWorkflowsHandler(tenants)));
	router.post("/workflow-instances/:uuid/-/start", adapt(startWorkflowHandler(tenants)));
	router.post(
		"/workflow-instances/:uuid/-/transition",
		adapt(transitionWorkflowHandler(tenants)),
	);
	router.post(
		"/workflow-instances/:uuid/-/cancel",
		adapt(cancelWorkflowHandler(tenants)),
	);
	router.get("/workflow-instances/:uuid", adapt(getWorkflowInstanceHandler(tenants)));
	router.patch("/workflow-instances/:uuid/-/update", adapt(updateWorkflowNodeHandler(tenants)));
	router.put(
		"/workflow-instances/:uuid/-/update-file",
		adapt(updateWorkflowNodeFileHandler(tenants)),
	);

	// Workflow definition CRUD operations
	router.get("/workflow-definitions", adapt(listWorkflowDefinitionsHandler(tenants)));
	router.post(
		"/workflow-definitions",
		adapt(createOrReplaceWorkflowDefinitionHandler(tenants)),
	);
	router.get("/workflow-definitions/:uuid", adapt(getWorkflowDefinitionHandler(tenants)));
	router.delete(
		"/workflow-definitions/:uuid",
		adapt(deleteWorkflowDefinitionHandler(tenants)),
	);
	router.get(
		"/workflow-definitions/:uuid/-/export",
		adapt(exportWorkflowDefinitionHandler(tenants)),
	);

	return router;
}
