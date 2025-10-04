import { type AntboxTenant } from "api/antbox_tenant.ts";
import {
	createGroupHandler,
	deleteGroupHandler,
	getGroupHandler,
	listGroupsHandler,
	updateGroupHandler,
} from "api/groups_handlers.ts";
import { createRouter, type Router } from "h3";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = createRouter();

	// CRUD operations
	router.post("/", adapt(createGroupHandler(tenants)));
	router.get("/", adapt(listGroupsHandler(tenants)));
	router.get("/:uuid", adapt(getGroupHandler(tenants)));
	router.put("/:uuid", adapt(updateGroupHandler(tenants)));
	router.delete("/:uuid", adapt(deleteGroupHandler(tenants)));

	return router;
}
