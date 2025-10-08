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
	const response = await next(req);
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, DELETE",
	);
	response.headers.set("Access-Control-Allow-Headers", "Content-Type");
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
