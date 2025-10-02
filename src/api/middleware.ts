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
	console.log(`${req.method} ${req.url}`);
	return await next(req);
};
