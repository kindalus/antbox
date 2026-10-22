import { type AntboxTenant } from "./antbox_tenant.ts";
import { defaultMiddlewareChain } from "./default_middleware_chain.ts";
import { getAuthenticationContext } from "./get_authentication_context.ts";
import { getTenant } from "./get_tenant.ts";
import { type HttpHandler } from "./handler.ts";
import { parseJsonBody } from "./parse_json_body.ts";
import { NotificationDataSchema } from "domain/configuration/notification_schema.ts";
import { z } from "zod";
import { processError } from "./process_error.ts";
import { processServiceCreateResult, processServiceResult } from "./process_service_result.ts";
import { checkServiceAvailability } from "./service_availability.ts";

const notificationRequestSchema = z.object({
	targetUser: NotificationDataSchema.shape.targetUser,
	targetGroup: NotificationDataSchema.shape.targetGroup,
	title: NotificationDataSchema.shape.title,
	body: NotificationDataSchema.shape.body,
}).refine((value) => value.targetUser !== undefined || value.targetGroup !== undefined, {
	message: "{ targetUser } or { targetGroup } must be provided",
});
const deleteRequestSchema = z.object({ uuids: z.array(z.string().min(1)).min(1) });

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

			const parsed = await parseJsonBody(req, notificationRequestSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			const body = parsed.value;

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

			const parsed = await parseJsonBody(req, notificationRequestSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			const body = parsed.value;

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

			const parsed = await parseJsonBody(req, notificationRequestSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			const body = parsed.value;

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

			const parsed = await parseJsonBody(req, deleteRequestSchema);
			if (parsed.isLeft()) return processError(parsed.value);
			const body = parsed.value;

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
