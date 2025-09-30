import { AntboxError } from "shared/antbox_error.ts";

export class InvalidSecretFormatError extends AntboxError {
  static ERROR_CODE = "InvalidSecretFormatError";

  constructor(
    message =
      "Invalid secret format. Secret must be at least 8 characters long.",
  ) {
    super(InvalidSecretFormatError.ERROR_CODE, message);
    this.name = "InvalidSecretFormatError";
  }
}
