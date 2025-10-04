import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createUserHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Users service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const metadata = await req.json();
			if (!metadata?.email) {
				return new Response(
					JSON.stringify({ error: "{ email } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return service
				.createUser(getAuthenticationContext(req), metadata)
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function getUserHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Users service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const params = getParams(req);
			if (!params.email) {
				return new Response(
					JSON.stringify({ error: "{ email } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return service
				.getUser(getAuthenticationContext(req), params.email)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function updateUserHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Users service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const params = getParams(req);
			if (!params.email) {
				return new Response(
					JSON.stringify({ error: "{ email } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			const metadata = await req.json();
			return service
				.updateUser(getAuthenticationContext(req), params.email, metadata)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteUserHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Users service not available" }),
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

			return service
				.deleteUser(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listUsersHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Users service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			return service
				.listUsers(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
