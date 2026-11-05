import type { Context } from "hono";
import { type HttpHandler } from "api/handler.ts";
import {
	httpTelemetryAttributes,
	setHttpSpanStatus,
	setTelemetryAttributes,
	withTelemetrySpan,
} from "shared/telemetry.ts";

/**
 * Adapts a domain HttpHandler to a Hono request handler.
 *
 * @remarks
 * External setup: none. Mount the resulting handler on a Hono app.
 * The request body is passed to the handler as an unread stream, and the handler's response is
 * returned untouched.
 *
 * @example
 * router.get("/", adapt(listHandler(tenants)));
 */
export function adapt(handler: HttpHandler): (ctx: Context) => Promise<Response> {
	return (ctx: Context) => {
		const raw = ctx.req.raw;
		const route = ctx.req.routePath;
		const spanName = `HTTP ${raw.method} ${route ?? new URL(raw.url).pathname}`;
		const headers = new Headers(raw.headers);
		const attributeRequest = new Request(raw.url, { headers, method: raw.method });

		return withTelemetrySpan(
			spanName,
			{
				...httpTelemetryAttributes(attributeRequest, route),
				"antbox.route.name": undefined,
			},
			async (span) => {
				headers.set("x-params", JSON.stringify(paramsFromContext(ctx)));

				const init: RequestInit & { duplex?: "half" } = {
					headers,
					method: raw.method,
				};
				if (raw.body) {
					init.body = raw.body;
					init.duplex = "half";
				}

				const req = new Request(raw.url, init);
				const res = await handler(req);
				setHttpSpanStatus(span, res.status);
				setTelemetryAttributes(span, {
					"antbox.tenant": httpTelemetryAttributes(req, route)["antbox.tenant"],
				});

				return res;
			},
		);
	};
}

/**
 * Route parameters keep the case and decoding of the request URL: the server matches paths
 * case-insensitively, so the values Hono extracts cannot be trusted.
 */
function paramsFromContext(ctx: Context): Record<string, string> {
	const params: Record<string, string> = {};
	const pattern = ctx.req.routePath.split("/");
	const actual = new URL(ctx.req.url).pathname.split("/");

	pattern.forEach((segment, index) => {
		if (segment.startsWith(":") && actual[index] !== undefined) {
			params[segment.slice(1)] = decodeComponent(actual[index]);
		}
	});

	return params;
}

function decodeComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
