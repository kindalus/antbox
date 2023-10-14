import { Context } from "../../../deps.ts";
import { UserExistsError } from "../../domain/auth/user_exists_error.ts";
import { FolderNotFoundError } from "../../domain/nodes/folder_not_found_error.ts";
import { NodeNotFoundError } from "../../domain/nodes/node_not_found_error.ts";
import { AntboxError, BadRequestError, ForbiddenError } from "../../shared/antbox_error.ts";
import { ValidationError } from "../../shared/validation_error.ts";
import {
	sendBadRequest,
	sendConflict,
	sendForbidden,
	sendInternalServerError,
	sendNotFound,
} from "./send_response.ts";

export function processError(
	{ errorCode, message }: AntboxError,
	ctx: Context,
) {
	switch (errorCode) {
		case NodeNotFoundError.ERROR_CODE:
		case FolderNotFoundError.ERROR_CODE:
			return sendNotFound(ctx, message);

		case BadRequestError.ERROR_CODE:
		case ValidationError.ERROR_CODE:
			return sendBadRequest(ctx, message);

		case UserExistsError.ERROR_CODE:
			return sendConflict(ctx, message);

		case ForbiddenError.ERROR_CODE:
			return sendForbidden(ctx, message);

		default:
			console.error(errorCode, message);
			return sendInternalServerError(ctx, message);
	}
}
