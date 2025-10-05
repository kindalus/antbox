export type HttpHandler = (req: Request) => Promise<Response>;

const enum STATUS_CODE {
	OK = 200,
	Created = 201,
	BadRequest = 400,
	Unauthorized = 401,
	Forbidden = 403,
	NotFound = 404,
	Conflict = 409,
	InternalServerError = 500,
	ServiceUnavailable = 503,
}

export function sendCreated<T>(body?: T) {
	return sendResponse(STATUS_CODE.Created, body);
}

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

export function sendServiceUnavailable<T>(body?: T) {
	return sendResponse(STATUS_CODE.ServiceUnavailable, body);
}

function sendResponse<T>(status: number, body?: T): Response {
	const options = { status, headers: new Headers() };

	if (body) {
		options.headers.set("Content-Type", "application/json");
		return new Response(JSON.stringify(body), options);
	}

	return new Response(null, options);
}
