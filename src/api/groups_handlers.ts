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

export function createGroupHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Groups service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const metadata = await req.json();
			if (!metadata?.title) {
				return new Response(
					JSON.stringify({ error: "{ title } not given" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}

			return service
				.createGroup(getAuthenticationContext(req), metadata)
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function getGroupHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Groups service not available" }),
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
				.getGroup(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function updateGroupHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Groups service not available" }),
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
			return service
				.updateGroup(getAuthenticationContext(req), params.uuid, metadata)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteGroupHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Groups service not available" }),
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
				.deleteGroup(getAuthenticationContext(req), params.uuid)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function listGroupsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			if (!service) {
				return new Response(
					JSON.stringify({ error: "Groups service not available" }),
					{ status: 503, headers: { "Content-Type": "application/json" } },
				);
			}

			const groups = await service.listGroups(getAuthenticationContext(req));
			return new Response(JSON.stringify(groups), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		},
	);
}
