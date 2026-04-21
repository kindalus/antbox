import { AnswerOptions, ChatOptions } from "application/ai/agents_engine.ts";
import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult, processServiceUpsertResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";
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
			if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
				return sendBadRequest({ error: "JSON object body required" });
			}

			return tenant.agentsService!
				.createOrReplaceAgent(getAuthenticationContext(req), metadata)
				.then(processServiceUpsertResult)
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
