import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler, sendBadRequest } from "./handler.ts";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";

// ============================================================================
// NOTIFICATION HANDLERS
// ============================================================================

export function sendCriticalNotificationHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.notificationsService;

			const unavailableResponse = checkServiceAvailability(service, "Notifications service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const body = await req.json();
			if (!body?.title) {
				return sendBadRequest({ error: "{ title } not given" });
			}
			if (!body?.body) {
				return sendBadRequest({ error: "{ body } not given" });
			}
			if (!body?.targetUser && !body?.targetGroup) {
				return sendBadRequest({ error: "{ targetUser } or { targetGroup } must be provided" });
			}

			return service
				.critical(getAuthenticationContext(req), {
					targetUser: body.targetUser,
					targetGroup: body.targetGroup,
					title: body.title,
					body: body.body,
				})
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function sendInfoNotificationHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.notificationsService;

			const unavailableResponse = checkServiceAvailability(service, "Notifications service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const body = await req.json();
			if (!body?.title) {
				return sendBadRequest({ error: "{ title } not given" });
			}
			if (!body?.body) {
				return sendBadRequest({ error: "{ body } not given" });
			}
			if (!body?.targetUser && !body?.targetGroup) {
				return sendBadRequest({ error: "{ targetUser } or { targetGroup } must be provided" });
			}

			return service
				.info(getAuthenticationContext(req), {
					targetUser: body.targetUser,
					targetGroup: body.targetGroup,
					title: body.title,
					body: body.body,
				})
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function sendInsightNotificationHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.notificationsService;

			const unavailableResponse = checkServiceAvailability(service, "Notifications service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const body = await req.json();
			if (!body?.title) {
				return sendBadRequest({ error: "{ title } not given" });
			}
			if (!body?.body) {
				return sendBadRequest({ error: "{ body } not given" });
			}
			if (!body?.targetUser && !body?.targetGroup) {
				return sendBadRequest({ error: "{ targetUser } or { targetGroup } must be provided" });
			}

			return service
				.insight(getAuthenticationContext(req), {
					targetUser: body.targetUser,
					targetGroup: body.targetGroup,
					title: body.title,
					body: body.body,
				})
				.then(processServiceCreateResult)
				.catch(processError);
		},
	);
}

export function listNotificationsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.notificationsService;

			const unavailableResponse = checkServiceAvailability(service, "Notifications service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			return service
				.list(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function deleteNotificationsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.notificationsService;

			const unavailableResponse = checkServiceAvailability(service, "Notifications service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			const body = await req.json();
			if (!body?.uuids || !Array.isArray(body.uuids) || body.uuids.length === 0) {
				return sendBadRequest({ error: "{ uuids } array is required and must not be empty" });
			}

			return service
				.delete(getAuthenticationContext(req), body.uuids)
				.then(processServiceResult)
				.catch(processError);
		},
	);
}

export function clearAllNotificationsHandler(tenants: AntboxTenant[]): HttpHandler {
	return defaultMiddlewareChain(
		tenants,
		async (req: Request): Promise<Response> => {
			const tenant = getTenant(req, tenants);
			const service = tenant.notificationsService;

			const unavailableResponse = checkServiceAvailability(service, "Notifications service");
			if (unavailableResponse) {
				return Promise.resolve(unavailableResponse);
			}

			return service
				.clearAll(getAuthenticationContext(req))
				.then(processServiceResult)
				.catch(processError);
		},
	);
}
