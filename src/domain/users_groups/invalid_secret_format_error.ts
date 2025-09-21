import { AntboxError } from "shared/antbox_error.ts";

export class InvalidSecretFormatError extends AntboxError {
  constructor(
    message =
      "Invalid secret format. Secret must be at least 8 characters long.",
  ) {
    super(message);
    this.name = "InvalidSecretFormatError";
  }
}
