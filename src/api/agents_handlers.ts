import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getQuery } from "./get_query.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createAgentHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			if (!tenant.agentService) {
				return new Response(
					JSON.stringify({ error: "AI agents not enabled for this tenant" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const metadata = await req.json();
			if (!metadata?.systemInstructions) {
				return new Response(
					JSON.stringify({ error: "{ systemInstructions } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return tenant.agentService
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
			if (!tenant.agentService) {
				return new Response(
					JSON.stringify({ error: "AI agents not enabled for this tenant" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return new Response(
					JSON.stringify({ error: "{ uuid } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return tenant.agentService
				.get(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function updateAgentHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			if (!tenant.agentService) {
				return new Response(
					JSON.stringify({ error: "AI agents not enabled for this tenant" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return new Response(
					JSON.stringify({ error: "{ uuid } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			const metadata = await req.json();
			return tenant.agentService
				.createOrReplace(getAuthenticationContext(req), { ...metadata, uuid: params.uuid })
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
			if (!tenant.agentService) {
				return new Response(
					JSON.stringify({ error: "AI agents not enabled for this tenant" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return new Response(
					JSON.stringify({ error: "{ uuid } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return tenant.agentService
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
			if (!tenant.agentService) {
				return new Response(
					JSON.stringify({ error: "AI agents not enabled for this tenant" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			return tenant.agentService
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
			if (!tenant.agentService) {
				return new Response(
					JSON.stringify({ error: "AI agents not enabled for this tenant" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return new Response(
					JSON.stringify({ error: "{ uuid } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
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
					return new Response(
						JSON.stringify({ error: "{ input } field must be valid JSON" }),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
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
				return new Response(
					JSON.stringify({ error: "{ message } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			// Extract message and build options
			const { message, ...options } = chatInput;
			if (files) {
				options.files = files;
			}

			return tenant.agentService
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
			if (!tenant.agentService) {
				return new Response(
					JSON.stringify({ error: "AI agents not enabled for this tenant" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return new Response(
					JSON.stringify({ error: "{ uuid } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
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
					return new Response(
						JSON.stringify({ error: "{ input } field must be valid JSON" }),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
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
				return new Response(
					JSON.stringify({ error: "{ query } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			// Extract query and build options
			const { query, ...options } = answerInput;
			if (files) {
				options.files = files;
			}

			return tenant.agentService
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
			if (!tenant.ragService) {
				return new Response(
					JSON.stringify({ error: "RAG service not enabled for this tenant" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const chatInput = await req.json();
			if (!chatInput?.message) {
				return new Response(
					JSON.stringify({ error: "{ message } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return tenant.ragService
				.chat(getAuthenticationContext(req), chatInput)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
