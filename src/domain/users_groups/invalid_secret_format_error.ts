import { AntboxError } from "shared/antbox_error.ts";

export class InvalidSecretFormatError extends AntboxError {
  static ERROR_CODE = "InvalidSecretFormatError";

  constructor() {
    super(
      InvalidSecretFormatError.ERROR_CODE,
      "Secret must be at least 8 characters long",
    );
  }
}
