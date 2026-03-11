import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createUserPreferencesHandler,
	deleteUserPreferencesHandler,
	getPreferenceHandler,
	getUserPreferencesHandler,
	updateUserPreferencesHandler,
} from "api/user_preferences_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/user-preferences" });

	router.post("/", adapt(createUserPreferencesHandler(tenants)));
	router.get("/", adapt(getUserPreferencesHandler(tenants)));
	router.patch("/", adapt(updateUserPreferencesHandler(tenants)));
	router.delete("/", adapt(deleteUserPreferencesHandler(tenants)));
	router.get("/:key", adapt(getPreferenceHandler(tenants)));

	return router;
}
