import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";
import { UserDataSchema } from "domain/configuration/user_schema.ts";
import { parseJsonBody } from "./parse_json_body.ts";

const updateUserSchema = UserDataSchema.partial();
const createUserSchema = updateUserSchema.required({ email: true });

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createUserHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.usersService;

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const parsed = await parseJsonBody(req, createUserSchema);
			if (parsed.isLeft()) return processError(parsed.value);

			return service
				.createUser(getAuthenticationContext(req), parsed.value)
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
			const service = tenant.usersService;

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
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
			const service = tenant.usersService;

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.email) {
				return sendBadRequest({ error: "{ email } not given" });
			}

			const parsed = await parseJsonBody(req, updateUserSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			return service
				.updateUser(getAuthenticationContext(req), params.email, parsed.value)
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
			const service = tenant.usersService;

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const params = getParams(req);
			if (!params.email) {
				return sendBadRequest({ error: "{ email } not given" });
			}

			return service
				.deleteUser(getAuthenticationContext(req), params.email)
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
			const service = tenant.usersService;

			const unavailableResponse = checkServiceAvailability(service, "Users service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			return service
				.listUsers(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
