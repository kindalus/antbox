import { AntboxError } from "shared/antbox_error.ts";

export class InvalidUsernameFormatError extends AntboxError {
  static ERR_CODE = "InvalidUsernameFormatError";

  constructor(username: string) {
    super(
      InvalidUsernameFormatError.ERR_CODE,
      `Invalid Fullname Format: ${username}`,
    );
  }
}
