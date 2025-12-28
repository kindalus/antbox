import { AnswerOptions, ChatOptions } from "application/ai/agents_engine.ts";
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

			const unavailableResponse = checkServiceAvailability(tenant.agentsService, "AI agents");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const metadata = await req.json();

			if (!metadata?.systemInstructions) {
				return sendBadRequest({ error: "{ systemInstructions } not given" });
			}

			return tenant.agentsService!
				.createAgent(getAuthenticationContext(req), metadata)
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
			const unavailableResponse = checkServiceAvailability(tenant.agentsService, "AI agents");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return tenant.agentsService!
				.getAgent(getAuthenticationContext(req), params.uuid)
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
			const unavailableResponse = checkServiceAvailability(tenant.agentsService, "AI agents");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
			}

			return tenant.agentsService!
				.deleteAgent(getAuthenticationContext(req), params.uuid)
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
			const unavailableResponse = checkServiceAvailability(tenant.agentsService, "AI agents");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			return tenant.agentsService!
				.listAgents(getAuthenticationContext(req))
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
			const unavailableResponse = checkServiceAvailability(tenant.agentsService, "AI agents");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			try {
				return processServiceResult(tenant.agentsService!
					.listModels(getAuthenticationContext(req)));
			} catch (err: unknown) {
				return processError(err as AntboxError);
			}
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
			const unavailableResponse = checkServiceAvailability(tenant.agentsEngine, "Agents engine");
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

			return tenant.agentsEngine
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
			const unavailableResponse = checkServiceAvailability(tenant.agentsEngine, "Agents engine");
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

			return tenant.agentsEngine
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
