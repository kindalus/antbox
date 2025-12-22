import { Router } from "@oak/oak";
import type { AntboxTenant } from "api/antbox_tenant.ts";
import {
	createOrReplaceHandler,
	deleteHandler,
	getHandler,
	getLocalizedByFidHandler,
	getLocalizedHandler,
	listHandler,
} from "api/articles_handlers.ts";
import { adapt } from "./adapt.ts";

export default function (tenants: AntboxTenant[]) {
	const articlesRouter = new Router({ prefix: "/articles" });

	articlesRouter.get("/", adapt(listHandler(tenants)));
	articlesRouter.post("/", adapt(createOrReplaceHandler(tenants)));
	articlesRouter.get("/:uuid", adapt(getHandler(tenants)));
	articlesRouter.get("/:uuid/-/localized", adapt(getLocalizedHandler(tenants)));
	articlesRouter.get("/-/fid/:fid", adapt(getLocalizedByFidHandler(tenants)));
	articlesRouter.delete("/:uuid", adapt(deleteHandler(tenants)));

	return articlesRouter;
}
