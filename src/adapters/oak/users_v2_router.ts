import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createUserHandler,
	deleteUserHandler,
	getUserHandler,
	listUsersHandler,
	updateUserHandler,
} from "api/users_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/users" });

	// CRUD operations
	router.post("/", adapt(createUserHandler(tenants)));
	router.get("/", adapt(listUsersHandler(tenants)));
	router.get("/:email", adapt(getUserHandler(tenants)));
	// TODO: update openapi.yaml since this method used to be PUT
	router.patch("/:email", adapt(updateUserHandler(tenants)));
	router.delete("/:uuid", adapt(deleteUserHandler(tenants)));

	return router;
}
