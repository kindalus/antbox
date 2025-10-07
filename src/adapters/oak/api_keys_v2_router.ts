import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createApiKeyHandler,
	deleteApiKeyHandler,
	getApiKeyHandler,
	listApiKeysHandler,
} from "api/api_keys_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = new Router({ prefix: "/api-keys" });

	// CRUD operations
	router.post("/", adapt(createApiKeyHandler(tenants)));
	router.get("/", adapt(listApiKeysHandler(tenants)));
	router.get("/:uuid", adapt(getApiKeyHandler(tenants)));
	router.delete("/:uuid", adapt(deleteApiKeyHandler(tenants)));

	return router;
}
