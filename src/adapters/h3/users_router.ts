import { type AntboxTenant } from "api/antbox_tenant.ts";
import {
	createUserHandler,
	deleteUserHandler,
	getUserHandler,
	listUsersHandler,
	updateUserHandler,
} from "api/users_handlers.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = createRouter();

	// CRUD operations
	router.post("/", adapt(createUserHandler(tenants)));
	router.get("/", adapt(listUsersHandler(tenants)));
	router.get("/:email", adapt(getUserHandler(tenants)));
	router.put("/:email", adapt(updateUserHandler(tenants)));
	router.delete("/:uuid", adapt(deleteUserHandler(tenants)));

	return router;
}
