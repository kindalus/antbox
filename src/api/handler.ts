import { STATUS_CODE } from "@std/http";

export type HttpHandler = (req: Request) => Promise<Response>;

export function sendOK<T>(body?: T) {
	return sendResponse(STATUS_CODE.OK, body);
}

export function sendNotFound<T>(body?: T) {
	return sendResponse(STATUS_CODE.NotFound, body);
}

export function sendInternalServerError<T>(body?: T) {
	return sendResponse(STATUS_CODE.InternalServerError, body);
}

export function sendBadRequest<T>(body?: T) {
	return sendResponse(STATUS_CODE.BadRequest, body);
}

export function sendForbidden<T>(body?: T) {
	return sendResponse(STATUS_CODE.Forbidden, body);
}

export function sendUnauthorized() {
	return sendResponse(STATUS_CODE.Unauthorized);
}

export function sendConflict<T>(body?: T) {
	return sendResponse(STATUS_CODE.Conflict, body);
}

function sendResponse<T>(status: number, body?: T): Response {
	const options = { status, headers: new Headers() };

	if (body) {
		options.headers.set("Content-Type", "application/json");
		return new Response(JSON.stringify(body), options);
	}

	return new Response(null, options);
}
