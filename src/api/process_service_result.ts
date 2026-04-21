import { AntboxError } from "shared/antbox_error.ts";
import { type Either } from "shared/either.ts";
import { sendCreated, sendOK } from "./handler.ts";
import { processError } from "./process_error.ts";

export function processServiceResult<T>(
	resultOrErr: Either<AntboxError, T>,
): Response {
	if (resultOrErr.isLeft()) {
		return processError(resultOrErr.value);
	}

	return sendOK(resultOrErr.value);
}

export function processServiceCreateResult<T>(
	resultOrErr: Either<AntboxError, T>,
): Response {
	if (resultOrErr.isLeft()) {
		return processError(resultOrErr.value);
	}

	return sendCreated(resultOrErr.value);
}

export function processServiceUpsertResult<T>(
	resultOrErr: Either<AntboxError, { created: boolean; agent: T }>,
): Response {
	if (resultOrErr.isLeft()) {
		return processError(resultOrErr.value);
	}

	return resultOrErr.value.created
		? sendCreated(resultOrErr.value.agent)
		: sendOK(resultOrErr.value.agent);
}
