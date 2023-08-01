import { Context, OakRequest, Router } from "../../../deps.ts";
import { ContextWithParams } from "./context_with_params.ts";
import { getTenant } from "./get_tenant.ts";
import { processError } from "./process_error.ts";
import { sendInternalServerError } from "./send_response.ts";
import { AntboxTenant } from "./setup_oak_server.ts";

export default function (tenants: AntboxTenant[]) {
	const extRouter = new Router({ prefix: "/ext" });

	const runHandler = async (ctx: ContextWithParams) => {
		const service = getTenant(ctx, tenants).service;
		const request = await fromOakRequest(ctx.request);

		return service
			.runExtension(ctx.params.uuid, request)
			.then((resOrErr) => {
				if (resOrErr.isLeft()) {
					return sendInternalServerError(ctx, resOrErr.value);
				}

				return writeResponse(resOrErr.value, ctx);
			})
			.catch((err) => processError(err, ctx));
	};

	extRouter.get("/:uuid", runHandler);
	extRouter.post("/:uuid", runHandler);

	return extRouter;
}

async function fromOakRequest(request: OakRequest): Promise<Request> {
	const headers = new Headers();
	for (const [key, value] of request.headers.entries()) {
		headers.set(key, value);
	}

	return new Request(request.url, {
		method: request.method,
		headers,
		body: request.hasBody ? await request.body({ type: "stream" }).value : null,
	});
}

function writeResponse(response: globalThis.Response, ctx: Context) {
	ctx.response.headers.set(
		"Content-Type",
		response.headers.get("Content-Type")!,
	);
	ctx.response.status = response.status;
	ctx.response.body = response.body;
}
