import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";

// ============================================================================
// WORKFLOW INSTANCE HANDLERS
// ============================================================================

export function startWorkflowHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			try {
				const body = await req.json();
				if (!body?.workflowDefinitionUuid) {
					return sendBadRequest({ error: "{ workflowDefinitionUuid } not given" });
				}

				return await service!
					.startWorkflow(
						getAuthenticationContext(req),
						params.uuid,
						body.workflowDefinitionUuid,
						body.groupsAllowed,
					)
					.then(processServiceResult)
					.catch(processError);
			} catch (_error) {
				return sendBadRequest({ error: "Invalid JSON body" });
			}
		},
	);
}

export function transitionWorkflowHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			try {
				const body = await req.json();
				if (!body?.signal) {
					return sendBadRequest({ error: "{ signal } not given" });
				}

				return await service!
					.transition(
						getAuthenticationContext(req),
						params.uuid,
						body.signal,
						body.message,
					)
					.then(processServiceResult)
					.catch(processError);
			} catch (_error) {
				return sendBadRequest({ error: "Invalid JSON body" });
			}
		},
	);
}

export function getWorkflowInstanceHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service!
				.getInstance(getAuthenticationContext(req), params.uuid)
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
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service!
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
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const url = new URL(req.url);
			const workflowDefinitionUuid = url.searchParams.get("workflowDefinitionUuid") || undefined;

			return service!
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
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			try {
				const metadata = await req.json();

				return await service!
					.createOrReplaceWorkflow(getAuthenticationContext(req), metadata)
					.then(processServiceResult)
					.catch(processError);
			} catch (_error) {
				return sendBadRequest({ error: "Invalid JSON body" });
			}
		},
	);
}

export function getWorkflowDefinitionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service!
				.getWorkflowDefinition(getAuthenticationContext(req), params.uuid)
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
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			return service!
				.listWorkflowDefinitions(getAuthenticationContext(req))
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
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service!
				.deleteWorkflowDefinition(getAuthenticationContext(req), params.uuid)
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
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid } not given" }));
			}

			return service!
				.exportWorkflowDefinition(getAuthenticationContext(req), params.uuid)
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
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			try {
				const metadata = await req.json();

				return await service!
					.updateNode(getAuthenticationContext(req), params.uuid, metadata)
					.then(processServiceResult)
					.catch(processError);
			} catch (_error) {
				return sendBadRequest({ error: "Invalid JSON body" });
			}
		},
	);
}

export function updateWorkflowNodeFileHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.workflowService;

			const unavailableResponse = checkServiceAvailability(service, "Workflow service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			try {
				const formData = await req.formData();
				const file = formData.get("file") as File;

				if (!file) {
					return sendBadRequest({ error: "{ file } not given in form data" });
				}

				return await service!
					.updateNodeFile(getAuthenticationContext(req), params.uuid, file)
					.then(processServiceResult)
					.catch(processError);
			} catch (_error) {
				return sendBadRequest({ error: "Invalid multipart/form-data body" });
			}
		},
	);
}
