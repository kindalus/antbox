import { AntboxError, BadRequestError, ForbiddenError } from "/shared/antbox_error.ts";
import { Context } from "/deps/oak";
import {
	sendBadRequest,
	sendForbidden,
	sendInternalServerError,
	sendNotFound,
} from "./send_response.ts";
import { NodeNotFoundError } from "/domain/nodes/node_not_found_error.ts";
import { FolderNotFoundError } from "/domain/nodes/folder_not_found_error.ts";

export function processError(
	{ errorCode, message }: AntboxError,
	ctx: Context,
) {
	if (errorCode === BadRequestError.ERROR_CODE) {
		return sendBadRequest(ctx, message);
	}

	if (isNotFoundError(errorCode)) {
		return sendNotFound(ctx, message);
	}

	if (errorCode === ForbiddenError.ERROR_CODE) {
		return sendForbidden(ctx, message);
	}

	sendInternalServerError(ctx, message);

	console.error(errorCode, message);
}

function isNotFoundError(errorCode: string) {
	return [
		NodeNotFoundError.ERROR_CODE,
		FolderNotFoundError.ERROR_CODE,
	].includes(errorCode);
}
