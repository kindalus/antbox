import { Hono } from "hono";
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
 * Builds the workflows router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = workflowsRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono();

	// Workflow instance operations
	// :uuid always refers to the workflow instance UUID, except for /-/start where
	// no instance exists yet — nodeUuid and workflowDefinitionUuid are passed in the body.
	router.get("/workflow-instances", adapt(findActiveWorkflowsHandler(tenants)));
	router.post("/workflow-instances/-/start", adapt(startWorkflowHandler(tenants)));
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
