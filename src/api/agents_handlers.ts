import { z } from "zod";
import { AgentDataSchema } from "domain/configuration/agent_schema.ts";
import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceResult, processServiceUpsertResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";
import { parseJsonBody } from "./parse_json_body.ts";

const agentMetadataSchema = AgentDataSchema.omit({ createdTime: true, modifiedTime: true })
	.partial({ uuid: true, exposedToUsers: true })
	.extend({ systemPrompt: z.string().optional() });
const messageSchema = z.object({
	text: z.string().refine((text) => text.trim().length > 0, "Message text is required"),
});
const answerOptionsSchema = z.object({ instructions: z.string().optional() });
const chatMessageSchema = z.object({
	role: z.enum(["user", "model", "tool"]),
	parts: z.array(z.object({
		text: z.string().optional(),
		toolCall: z.object({
			id: z.string().optional(),
			name: z.string(),
			args: z.record(z.string(), z.unknown()),
		}).optional(),
		toolResponse: z.object({
			id: z.string().optional(),
			name: z.string(),
			text: z.string(),
		}).optional(),
	})),
	usage: z.object({
		promptTokens: z.number().nonnegative(),
		completionTokens: z.number().nonnegative(),
		totalTokens: z.number().nonnegative(),
	}).optional(),
});
const chatRequestSchema = messageSchema.extend({
	options: answerOptionsSchema.extend({ history: z.array(chatMessageSchema).optional() })
		.default({}),
});
const answerRequestSchema = messageSchema.extend({ options: answerOptionsSchema.default({}) });
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

			const parsed = await parseJsonBody(req, agentMetadataSchema);
			if (parsed.isLeft()) return processError(parsed.value);

			return tenant.agentsService!
				.createOrReplaceAgent(getAuthenticationContext(req), parsed.value)
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

			const parsed = await parseJsonBody(req, chatRequestSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			const { text, options } = parsed.value;

			return tenant.agentsEngine
				.chat(getAuthenticationContext(req), params.uuid, text, options)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function createAgentSessionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentsEngine, "Agents engine");
			if (unavailableResponse) return unavailableResponse;
			const { uuid } = getParams(req);
			if (!uuid) return sendBadRequest({ error: "{ uuid } not given" });
			const parsed = await parseJsonBody(req, messageSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			return tenant.agentsEngine
				.createChatSession(getAuthenticationContext(req), uuid, parsed.value.text)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function continueAgentSessionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentsEngine, "Agents engine");
			if (unavailableResponse) return unavailableResponse;
			const { uuid, sessionId } = getParams(req);
			if (!uuid || !sessionId) {
				return sendBadRequest({ error: "{ uuid, sessionId } not given" });
			}
			const parsed = await parseJsonBody(req, messageSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			return tenant.agentsEngine
				.continueChatSession(getAuthenticationContext(req), uuid, sessionId, parsed.value.text)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteAgentSessionHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		(req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const unavailableResponse = checkServiceAvailability(tenant.agentsEngine, "Agents engine");
			if (unavailableResponse) return Promise.resolve(unavailableResponse);
			const { uuid, sessionId } = getParams(req);
			if (!uuid || !sessionId) {
				return Promise.resolve(sendBadRequest({ error: "{ uuid, sessionId } not given" }));
			}
			return tenant.agentsEngine
				.deleteChatSession(getAuthenticationContext(req), uuid, sessionId)
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

			const parsed = await parseJsonBody(req, answerRequestSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			const { text, options } = parsed.value;

			return tenant.agentsEngine
				.answer(getAuthenticationContext(req), params.uuid, text, options)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
