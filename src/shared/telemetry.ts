import {
	type Attributes,
	type Span,
	type SpanOptions,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";

export type TelemetryAttributeValue = string | number | boolean;
export type TelemetryAttributes = Record<string, TelemetryAttributeValue | undefined>;

const DEFAULT_TENANT = "default";
const tracer = trace.getTracer("antbox");

export function cleanTelemetryAttributes(attributes: TelemetryAttributes): Attributes {
	return Object.fromEntries(
		Object.entries(attributes).filter((entry): entry is [string, TelemetryAttributeValue] =>
			entry[1] !== undefined
		),
	);
}

export function requestedTenantFromRequest(req: Request): string {
	const headerTenant = req.headers.get("X-Tenant")?.trim();
	if (headerTenant) {
		return headerTenant;
	}

	const queryTenant = new URL(req.url).searchParams.get("x-tenant")?.trim();
	return queryTenant || DEFAULT_TENANT;
}

export function httpTelemetryAttributes(
	req: Request,
	route?: string,
): TelemetryAttributes {
	const url = new URL(req.url);
	return {
		"http.request.method": req.method,
		"http.route": route,
		"url.scheme": url.protocol.replace(":", ""),
		"url.path": url.pathname,
		"server.address": url.hostname,
		"server.port": url.port ? Number(url.port) : undefined,
		"antbox.tenant": requestedTenantFromRequest(req),
	};
}

export async function withTelemetrySpan<T>(
	name: string,
	attributes: TelemetryAttributes,
	fn: (span: Span) => Promise<T>,
	options: SpanOptions = {},
): Promise<T> {
	return await tracer.startActiveSpan(
		name,
		{ ...options, attributes: cleanTelemetryAttributes(attributes) },
		async (span) => {
			try {
				return await fn(span);
			} catch (error) {
				recordTelemetryError(span, error);
				throw error;
			} finally {
				span.end();
			}
		},
	);
}

export function setTelemetryAttributes(span: Span, attributes: TelemetryAttributes): void {
	span.setAttributes(cleanTelemetryAttributes(attributes));
}

export function recordTelemetryError(span: Span, error: unknown): void {
	if (error instanceof Error) {
		span.recordException(error);
		span.setAttributes(cleanTelemetryAttributes({
			"exception.type": error.name,
			"exception.message": error.message,
		}));
	} else {
		span.setAttribute("exception.message", String(error));
	}

	span.setStatus({ code: SpanStatusCode.ERROR });
}

export function setHttpSpanStatus(span: Span, status: number): void {
	span.setAttribute("http.response.status_code", status);
	if (status >= 500) {
		span.setStatus({ code: SpanStatusCode.ERROR });
	}
}
