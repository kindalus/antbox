import { Router } from "../../../deps.ts";

import { ContextWithParams } from "./context_with_params.ts";
import { getRequestContext } from "./get_request_context.ts";
import { getTenantByContext } from "./get_tenant.ts";
import { processError } from "./process_error.ts";
import { sendOK } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
	const handleGet = async (ctx: ContextWithParams) => {
		const service = getTenantByContext(ctx, tenants).service;

		const result = await service.getWebContent(
			getRequestContext(ctx),
			ctx.params.uuid,
		);

		if (result.isLeft()) {
			return processError(result.value, ctx);
		}

		return sendOK(ctx, result.value);
	};

	const handleGetByLanguage = async (ctx: ContextWithParams) => {
		const service = getTenantByContext(ctx, tenants).service;
		const lang = ctx.params.lang as "pt" | "en" | "es" | "fr";

		const result = await service.getWebContentByLanguage(
			getRequestContext(ctx),
			ctx.params.uuid,
			lang,
		);

		if (result.isLeft()) {
			return processError(result.value, ctx);
		}

		ctx.response.type = "text/html; charset=UTF-8";
		ctx.response.body = result.value;
	};

	const webContentsRouter = new Router({ prefix: "/web-contents" });

	webContentsRouter.get("/:uuid/:lang", handleGetByLanguage);
	webContentsRouter.get("/:uuid", handleGet);

	return webContentsRouter;
}
