import { createRouter, Router } from "@h3";
import { AntboxTenant } from "../../api/antbox_tenant.ts";
import { listHandler } from "../../api/listHandler.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]): Router {
	const router = createRouter();

	router.get("/", adapt(listHandler(tenants)));

	return router;
}
