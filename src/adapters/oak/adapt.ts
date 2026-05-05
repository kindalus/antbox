import type { Context } from "@oak/oak";
import { type HttpHandler } from "api/handler.ts";
import {
	httpTelemetryAttributes,
	setHttpSpanStatus,
	setTelemetryAttributes,
	withTelemetrySpan,
} from "shared/telemetry.ts";

/**
 * Adapts a domain HttpHandler to an Oak request handler.
 *
 * @remarks
 * External setup: none. Mount the resulting handler on a Router.
 *
 * @example
 * router.get("/", adapt(listHandler(tenants)));
 */
export function adapt(handler: HttpHandler): (ctx: Context) => Promise<void> {
	return async (ctx: Context) => {
		const route = routeFromContext(ctx);
		const spanName = `HTTP ${ctx.request.method} ${route ?? new URL(ctx.request.url).pathname}`;
		const headers = headersFromContext(ctx);
		const attributeRequest = new Request(ctx.request.url, {
			headers,
			method: ctx.request.method,
		});

		await withTelemetrySpan(
			spanName,
			{
				...httpTelemetryAttributes(attributeRequest, route),
				"antbox.route.name": routeNameFromContext(ctx),
			},
			async (span) => {
				const body = await ctx.request.body.init();

				headers.set(
					"x-params",
					JSON.stringify(
						(ctx as Context & { params: Record<string, string> }).params,
					),
				);

				const init: RequestInit = {
					headers,
					method: ctx.request.method,
					body,
				};

				const req = new Request(ctx.request.url, init);
				const res = await handler(req);
				setHttpSpanStatus(span, res.status);
				setTelemetryAttributes(span, {
					"antbox.tenant": httpTelemetryAttributes(req, route)["antbox.tenant"],
				});

				ctx.response.status = res.status;
				ctx.response.body = res.body;

				// Copy all response headers
				for (const [key, value] of res.headers.entries()) {
					ctx.response.headers.set(key, value);
				}

				// Set content type if it's JSON
				if (res.headers.get("Content-Type") === "application/json") {
					ctx.response.type = "json";
				}
			},
		);
	};
}

type RouteAwareContext = Context & {
	matched?: Array<{ path?: string }>;
	routeName?: string;
};

function headersFromContext(ctx: Context): Headers {
	const headers = new Headers();
	for (const [key, value] of ctx.request.headers.entries()) {
		headers.set(key, value);
	}
	return headers;
}

function routeFromContext(ctx: Context): string | undefined {
	return (ctx as RouteAwareContext).matched?.at(-1)?.path;
}

function routeNameFromContext(ctx: Context): string | undefined {
	return (ctx as RouteAwareContext).routeName;
}
