import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createGroupHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.usersGroupsService;

			const unavailableResponse = checkServiceAvailability(service, "Groups service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const metadata = await req.json();
			if (!metadata?.title) {
				return sendBadRequest({ error: "{ title } not given" });
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
			const service = tenant.usersGroupsService;

			const unavailableResponse = checkServiceAvailability(service, "Groups service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
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
			const service = tenant.usersGroupsService;

			const unavailableResponse = checkServiceAvailability(service, "Groups service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
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
			const service = tenant.usersGroupsService;

			const unavailableResponse = checkServiceAvailability(service, "Groups service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
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
			const service = tenant.usersGroupsService;

			const unavailableResponse = checkServiceAvailability(service, "Groups service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const groups = await service.listGroups(getAuthenticationContext(req));
			return new Response(JSON.stringify(groups), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		},
	);
}
