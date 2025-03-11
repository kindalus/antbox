import { AntboxError } from "shared/antbox_error.ts";

export class UserNotFoundError extends AntboxError {
  static ERROR_CODE = "UserNotFoundError";

  constructor(value: string) {
    super(
      UserNotFoundError.ERROR_CODE,
      `User not found for the identifier: ${value}`,
    );
  }
}
