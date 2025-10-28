import { type HttpHandler } from "./handler.ts";

export type HttpMiddleware = (next: HttpHandler) => HttpHandler;

export function chain(
	handler: HttpHandler,
	...middlewares: HttpMiddleware[]
): HttpHandler {
	return middlewares.reduceRight(
		(next, middleware) => middleware(next),
		handler,
	);
}

export const corsMiddleware: HttpMiddleware = (next: HttpHandler) => async (req: Request) => {
	const origin = req.headers.get("origin");

	// Handle preflight requests
	if (req.method === "OPTIONS") {
		const response = new Response(null, { status: 204 });

		if (origin) {
			response.headers.set("Access-Control-Allow-Origin", origin);
			response.headers.set("Access-Control-Allow-Credentials", "true");
		} else {
			response.headers.set("Access-Control-Allow-Origin", "*");
		}

		response.headers.set(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, OPTIONS",
		);
		response.headers.set(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization, X-Tenant",
		);
		response.headers.set("Access-Control-Max-Age", "86400");

		return response;
	}

	// Process actual request
	const response = await next(req);

	// Set CORS headers based on whether origin is present
	if (origin) {
		// Cross-origin request - use specific origin and allow credentials
		response.headers.set("Access-Control-Allow-Origin", origin);
		response.headers.set("Access-Control-Allow-Credentials", "true");
	} else {
		// Same-origin or no origin - use wildcard (no credentials)
		response.headers.set("Access-Control-Allow-Origin", "*");
	}

	response.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, DELETE, OPTIONS",
	);
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization, X-Tenant",
	);

	return response;
};

export const logMiddleware: HttpMiddleware = (next: HttpHandler) => async (req: Request) => {
	try {
		const res = await next(req);
		console.debug(`${req.method} ${req.url} ${res.status}`);

		if (res.status >= 400 && res.status !== 404) {
			const body = await res.text();

			console.error(`Status: ${res.statusText}`);
			console.error(`Reason: ${body}`);

			return new Response(body, {
				headers: res.headers,
				status: res.status,
				statusText: res.statusText,
			});
		}

		return res;
	} catch (error) {
		console.error(error);
		throw error;
	}
};
