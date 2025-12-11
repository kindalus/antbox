import { AnswerOptions, ChatOptions } from "application/agent_service.ts";
import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";
import { AntboxError } from "shared/antbox_error.ts";

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
				return Promise.resolve(unavailableResponse);
			}

			const formdata = await req.formData();
			const file = formdata.get("file") as File;
			let metadata;

			try {
				metadata = JSON.parse(await file.text());

				if (!metadata) {
					return new Response("Missing metadata", { status: 400 });
				}
			} catch (_error) {
				return new Response("Invalid metadata", { status: 400 });
			}

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
				return Promise.resolve(unavailableResponse);
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
				return Promise.resolve(unavailableResponse);
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
				return Promise.resolve(unavailableResponse);
			}

			return tenant.agentService!
				.list(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listAIModelsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentService, "AI agents");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			try {
				return processServiceResult(tenant.agentService!
					.listModels(getAuthenticationContext(req)));
			} catch (err: unknown) {
				return processError(err as AntboxError);
			}
		},
	);
}

export function exportAgentHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentService, "AI agents");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}
			const agentOrErr = await tenant.agentService!.get(
				getAuthenticationContext(req),
				params.uuid,
			);

			if (agentOrErr.isLeft()) {
				return processError(agentOrErr.value);
			}

			const file = new File([JSON.stringify(agentOrErr.value, null, 2)], `${params.uuid}.json`, {
				type: "application/json",
			});

			const response = new Response(file);
			response.headers.set("Content-Type", file.type);
			response.headers.set("Content-length", file.size.toString());

			return response;
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
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			const chatInput = await req.json();

			if (!chatInput?.text) {
				return sendBadRequest({ error: "{ text } not given" });
			}

			// Extract text and options
			const { text, options = {} }: { text: string; options: ChatOptions } = chatInput;

			return tenant.agentService!
				.chat(getAuthenticationContext(req), params.uuid, text, options)
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
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			const chatInput = await req.json();

			if (!chatInput?.text) {
				return sendBadRequest({ error: "{ text } not given" });
			}

			// Extract text and options
			const { text, options = {} }: { text: string; options: AnswerOptions } = chatInput;

			return tenant.agentService!
				.answer(getAuthenticationContext(req), params.uuid, text, options)
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
				return Promise.resolve(unavailableResponse);
			}

			const chatInput = await req.json();
			if (!chatInput?.text) {
				return sendBadRequest({ error: "{ text } not given" });
			}

			// Extract text and options
			const { text, options = {} } = chatInput;

			return tenant.ragService!
				.chat(getAuthenticationContext(req), text, options)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
