import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	clearAllNotificationsHandler,
	deleteNotificationsHandler,
	listNotificationsHandler,
	sendCriticalNotificationHandler,
	sendInfoNotificationHandler,
	sendInsightNotificationHandler,
} from "api/notifications_handlers.ts";
import { adapt } from "./adapt.ts";

/**
 * Builds the notifications router for the Hono HTTP adapter.
 *
 * @remarks
 * External setup:
 * - Pass the configured tenant list (e.g., from `setupTenants`).
 * - Run Deno with `--allow-net` when serving HTTP.
 *
 * @example
 * const router = notificationsRouter(tenants);
 * app.route("/", router);
 */
export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/notifications");

	// List notifications for current user
	router.get("/", adapt(listNotificationsHandler(tenants)));

	// Send notifications by priority level
	router.post("/-/critical", adapt(sendCriticalNotificationHandler(tenants)));
	router.post("/-/info", adapt(sendInfoNotificationHandler(tenants)));
	router.post("/-/insight", adapt(sendInsightNotificationHandler(tenants)));

	// Delete specific notifications
	router.post("/-/delete", adapt(deleteNotificationsHandler(tenants)));

	// Clear all notifications for current user (only user-targeted, not group-targeted)
	router.post("/-/clear", adapt(clearAllNotificationsHandler(tenants)));

	return router;
}
