import { type AntboxTenant } from "./antbox_tenant.ts";
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

export function createUserHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.authService;

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const metadata = await req.json();
			if (!metadata?.email) {
				return sendBadRequest({ error: "{ email } not given" });
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

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.email) {
				return sendBadRequest({ error: "{ email } not given" });
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

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.email) {
				return sendBadRequest({ error: "{ email } not given" });
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

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			const params = getParams(req);
			if (!params.uuid) {
				return sendBadRequest({ error: "{ uuid } not given" });
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

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return unavailableResponse;
			}

			return service
				.listUsers(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
