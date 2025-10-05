import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createOrReplaceAgentHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentService, "AI agents");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const metadata = await req.json();
			if (!metadata?.systemInstructions) {
				return sendBadRequest({ error: "{ systemInstructions } not given" });
			}

			return tenant.agentService!
				.createOrReplace(getAuthenticationContext(req), metadata)
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function getAgentHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentService, "AI agents");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return tenant.agentService!
				.get(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteAgentHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentService, "AI agents");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return tenant.agentService!
				.delete(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listAgentsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentService, "AI agents");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			return tenant.agentService!
				.list(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

// ============================================================================
// EXECUTION HANDLERS
// ============================================================================

export function chatHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentService, "AI agents");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			// Check if this is multipart/form-data (with files) or JSON
			const contentType = req.headers.get("content-type") || "";
			let chatInput;
			let files: File[] | undefined;

			if (contentType.includes("multipart/form-data")) {
				const formData = await req.formData();
				const inputStr = formData.get("input");

				try {
					chatInput = JSON.parse(inputStr as string);
				} catch (_e) {
					return sendBadRequest({ error: "{ input } field must be valid JSON" });
				}

				// Collect all files from form data
				files = [];
				for (const [key, value] of formData.entries()) {
					if (key.startsWith("file") && value instanceof File) {
						files.push(value);
					}
				}

				if (files.length === 0) {
					files = undefined;
				}
			} else {
				chatInput = await req.json();
			}

			if (!chatInput?.message) {
				return sendBadRequest({ error: "{ message } not given" });
			}

			// Extract message and build options
			const { message, ...options } = chatInput;
			if (files) {
				options.files = files;
			}

			return tenant.agentService!
				.chat(getAuthenticationContext(req), params.uuid, message, options)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function answerHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentService, "AI agents");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			// Check if this is multipart/form-data (with files) or JSON
			const contentType = req.headers.get("content-type") || "";
			let answerInput;
			let files: File[] | undefined;

			if (contentType.includes("multipart/form-data")) {
				const formData = await req.formData();
				const inputStr = formData.get("input");

				try {
					answerInput = JSON.parse(inputStr as string);
				} catch (_e) {
					return sendBadRequest({ error: "{ input } field must be valid JSON" });
				}

				// Collect all files from form data
				files = [];
				for (const [key, value] of formData.entries()) {
					if (key.startsWith("file") && value instanceof File) {
						files.push(value);
					}
				}

				if (files.length === 0) {
					files = undefined;
				}
			} else {
				answerInput = await req.json();
			}

			if (!answerInput?.query) {
				return sendBadRequest({ error: "{ query } not given" });
			}

			// Extract query and build options
			const { query, ...options } = answerInput;
			if (files) {
				options.files = files;
			}

			return tenant.agentService!
				.answer(getAuthenticationContext(req), params.uuid, query, options)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

// ============================================================================
// RAG HANDLERS
// ============================================================================

export function ragChatHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.ragService, "RAG service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const chatInput = await req.json();
			if (!chatInput?.message) {
				return sendBadRequest({ error: "{ message } not given" });
			}

			// Extract message and build options
			const { message, ...options } = chatInput;

			return tenant.ragService!
				.chat(getAuthenticationContext(req), message, options)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
