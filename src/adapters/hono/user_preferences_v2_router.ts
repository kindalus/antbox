import { Hono } from "hono";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createUserPreferencesHandler,
	deleteUserPreferencesHandler,
	getPreferenceHandler,
	getUserPreferencesHandler,
	updateUserPreferencesHandler,
} from "api/user_preferences_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Hono {
	const router = new Hono().basePath("/user-preferences");

	router.post("/", adapt(createUserPreferencesHandler(tenants)));
	router.get("/", adapt(getUserPreferencesHandler(tenants)));
	router.patch("/", adapt(updateUserPreferencesHandler(tenants)));
	router.delete("/", adapt(deleteUserPreferencesHandler(tenants)));
	router.get("/:key", adapt(getPreferenceHandler(tenants)));

	return router;
}
