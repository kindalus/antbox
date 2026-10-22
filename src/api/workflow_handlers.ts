import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult } from "./process_service_result.ts";
import { parseJsonBody } from "./parse_json_body.ts";
import { getUploadFile, getUploadFormData } from "./upload_utils.ts";
import { z } from "zod";

const startSchema = z.object({
	nodeUuid: z.string({ error: "{ nodeUuid } not given" }).min(1, "{ nodeUuid } not given"),
	workflowDefinitionUuid: z.string({ error: "{ workflowDefinitionUuid } not given" }).min(1),
	participants: z.array(z.string().min(1)).optional(),
});
const transitionSchema = z.object({
	signal: z.string({ error: "{ signal } not given" }).min(1, "{ signal } not given"),
	message: z.string().optional(),
});
const metadataSchema = z.looseObject({});

// ============================================================================
// WORKFLOW INSTANCE HANDLERS
// ============================================================================

export function startWorkflowHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const engine = tenant.workflowInstancesEngine;

			const body = await parseJsonBody(req, startSchema);
			if (body.isLeft()) return sendBadRequest({ error: body.value.message });
			return engine
				.startWorkflow(
					getAuthenticationContext(req),
					body.value.nodeUuid,
					body.value.workflowDefinitionUuid,
					body.value.participants,
				)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function transitionWorkflowHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const engine = tenant.workflowInstancesEngine;

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			const body = await parseJsonBody(req, transitionSchema);
			if (body.isLeft()) return sendBadRequest({ error: body.value.message });
			return engine
				.transition(
					getAuthenticationContext(req),
					params.uuid,
					body.value.signal,
					body.value.message,
				)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function getWorkflowInstanceHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowInstancesService;

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service
				.getWorkflowInstance(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function cancelWorkflowHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const engine = tenant.workflowInstancesEngine;

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return engine
				.cancelWorkflow(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function findActiveWorkflowsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const engine = tenant.workflowInstancesEngine;

			const url = new URL(req.url);
			const workflowDefinitionUuid = url.searchParams.get("workflowDefinitionUuid") || undefined;

			return engine
				.findActiveInstances(getAuthenticationContext(req), workflowDefinitionUuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

// ============================================================================
// WORKFLOW DEFINITION CRUD HANDLERS
// ============================================================================

export function createOrReplaceWorkflowDefinitionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowsService;

			const metadata = await parseJsonBody(req, metadataSchema);
			if (metadata.isLeft()) return sendBadRequest({ error: metadata.value.message });
			return service
				.createOrReplaceWorkflow(getAuthenticationContext(req), metadata.value)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function getWorkflowDefinitionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowsService;

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service
				.getWorkflow(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listWorkflowDefinitionsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowsService;

			return service
				.listWorkflows(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteWorkflowDefinitionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowsService;

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service
				.deleteWorkflow(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function exportWorkflowDefinitionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowsService;

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service
				.getWorkflow(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

// ============================================================================
// WORKFLOW NODE UPDATE HANDLERS
// ============================================================================

export function updateWorkflowNodeHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const engine = tenant.workflowInstancesEngine;

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			const metadata = await parseJsonBody(req, metadataSchema);
			if (metadata.isLeft()) return sendBadRequest({ error: metadata.value.message });
			return engine
				.updateNode(getAuthenticationContext(req), params.uuid, metadata.value)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function updateWorkflowNodeFileHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const engine = tenant.workflowInstancesEngine;

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			const form = await getUploadFormData(req);
			if (form.isLeft()) return sendBadRequest({ error: form.value.message });
			const file = getUploadFile(form.value);
			if (file.isLeft()) return sendBadRequest({ error: file.value.message });
			return engine
				.updateNodeFile(getAuthenticationContext(req), params.uuid, file.value)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
