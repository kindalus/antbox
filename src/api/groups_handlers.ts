import type { AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getParams } from "./get_params.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";
import { GroupDataSchema } from "domain/configuration/group_schema.ts";
import { parseJsonBody } from "./parse_json_body.ts";

const createGroupSchema = GroupDataSchema.omit({ createdTime: true }).partial({ uuid: true });

// ============================================================================
// CRUD HANDLERS
// ============================================================================

export function createGroupHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.groupsService;

			const unavailableResponse = checkServiceAvailability(service, "Groups service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const parsed = await parseJsonBody(req, createGroupSchema);
			if (parsed.isLeft()) return processError(parsed.value);

			return service
				.createGroup(getAuthenticationContext(req), parsed.value)
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
			const service = tenant.groupsService;

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

export function deleteGroupHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.groupsService;

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
			const service = tenant.groupsService;

			const unavailableResponse = checkServiceAvailability(service, "Groups service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			return service
				.listGroups(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
