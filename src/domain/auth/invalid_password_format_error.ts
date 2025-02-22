import { AntboxError } from "shared/antbox_error.ts";

export class InvalidPasswordFormatError extends AntboxError {
  static ERROR_CODE = "InvalidPasswordFormatError";

  constructor() {
    super(
      InvalidPasswordFormatError.ERROR_CODE,
      "Password must be at least 8 characters long",
    );
  }
}
