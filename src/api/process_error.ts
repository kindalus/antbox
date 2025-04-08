import { UserExistsError } from "domain/users_groups/user_exists_error.ts";
import { FolderNotFoundError } from "domain/nodes/folder_not_found_error.ts";
import { NodeNotFoundError } from "domain/nodes/node_not_found_error.ts";
import { AntboxError, BadRequestError, ForbiddenError } from "shared/antbox_error.ts";
import { ValidationError } from "shared/validation_error.ts";
import {
  sendBadRequest,
  sendConflict,
  sendForbidden,
  sendInternalServerError,
  sendNotFound,
} from "./handler.ts";

export function processError({ errorCode, message }: AntboxError): Response {
  const body = { errorCode, message };

  switch (errorCode) {
    case NodeNotFoundError.ERROR_CODE:
    case FolderNotFoundError.ERROR_CODE:
      return sendNotFound(body);

    case BadRequestError.ERROR_CODE:
    case ValidationError.ERROR_CODE:
      return sendBadRequest(body);

    case UserExistsError.ERROR_CODE:
      return sendConflict(body);

    case ForbiddenError.ERROR_CODE:
      return sendForbidden(body);

    default:
      console.error(errorCode, body);
      return sendInternalServerError(body);
  }
}
